import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import { gameParts, type DuelResultDto, type TowerDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached } from '../../core/errors';
import type { Op } from '../../core/op';
import { gainRenown, spendStrength } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { randomAward, type RandomAward } from '../award/random';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { addAttrs } from '../equip/rules';
import { grantGoodsOp } from '../store/goods';
import { KEY, badInput, lockTowerState } from './common';
import { duel, duelPower } from './duel';
import {
  floorUnlocked,
  towerDailyTotal,
  towerNight,
  towerRenown,
  towerStrength,
  type TowerTuning,
} from './rules';
import { cachedSide, playerSide, sideDto, watchmanSide } from './sides';

/** 本区服守塔人当天的菜，键 = 层 */
async function watchmanMcs(
  db: Kysely<DB>,
  shardId: number,
): Promise<Map<number, { mcId: number; price: number }>> {
  const rows = await db
    .selectFrom('tower_watchman_mc')
    .select(['floor', 'mc_id', 'price'])
    .where('shard_id', '=', shardId)
    .execute();
  return new Map(rows.map((r) => [r.floor, { mcId: r.mc_id, price: r.price }]));
}

export async function towerView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: TowerTuning,
  now: Date,
  off = false,
): Promise<TowerDto> {
  const { day, hour } = gameParts(now);
  const state = await db
    .selectFrom('tower_state')
    .select('best_floor')
    .where('rest_id', '=', rest.id)
    .executeTakeFirst();
  const best = state?.best_floor ?? 0;
  const rows = await db
    .selectFrom('daily_counter')
    .select(['key', 'count'])
    .where('rest_id', '=', rest.id)
    .where('day', '=', day)
    .where('key', 'like', 'tower.%')
    .execute();
  const count = (key: string) => rows.find((r) => r.key === key)?.count ?? 0;
  const tickets = await db
    .selectFrom('store_item')
    .select('num')
    .where('rest_id', '=', rest.id)
    .where('goods_id', '=', GOODS.towerTicket)
    .executeTakeFirst();
  const mcs = await watchmanMcs(db, rest.shard_id);
  const total = towerDailyTotal(count(KEY.ticket), t);
  const me = await cachedSide(db, config, rest, 'attack', off);
  return {
    floors: [...config.towerFloors.values()].map((f) => ({
      floor: f.floor,
      name: f.name,
      title: f.title,
      note: f.note,
      minLevel: f.minLevel,
      power: f.power,
      maxTimes: f.maxTimes,
      left: Math.max(0, f.maxTimes - count(KEY.floor(f.floor))),
      unlocked: floorUnlocked(f, rest.level, best),
      cost: towerStrength(f.floor, false, t),
      mc: f.mc ? (mcs.get(f.floor) ?? null) : null,
      elder: {
        level: f.elder.level,
        stress: f.elder.stress,
        points: f.elder.points,
        pieces: f.elder.pieces.map((x) => ({ id: x.id, attrs: addAttrs(x.base, x.gain) })),
        attrs: f.attrs,
        drops: f.elder.drops,
        dropRate: t.elderDropRates[f.floor - 1] ?? 0,
      },
    })),
    power: duelPower(me.attrs),
    left: Math.max(0, total - count(KEY.done)),
    dailyTotal: total,
    tickets: tickets?.num ?? 0,
    bestFloor: best,
    strength: rest.strength,
    level: rest.level,
    hour,
    nightFloor: t.nightFloor,
    openHour: t.openHour,
    testCost: t.testStrength,
  };
}

/**
 * 挑战守塔人（设计文档 §3.2）。检查顺序：层号、解锁、夜间、（正式挑战）今日总次数、守塔人次数、体力。
 * 随机数顺序：对决（我五项、守塔人五项、抽评委）→ 随机奖励 → 长老套装掉落（判定、抽哪件、生成厨具属性）
 */
export async function challengeTower(o: Op, floorNo: number, test: boolean): Promise<DuelResultDto> {
  const t = o.tuning.tower;
  const f = o.config.towerFloors.get(floorNo);
  if (!f) throw badInput('floor');
  const state = await lockTowerState(o);
  if (!floorUnlocked(f, o.rest.level, state.best_floor))
    throw invalidState('floor_locked', { minLevel: f.minLevel, needFloor: floorNo - 1 });
  const { day, hour } = gameParts(o.now);
  if (towerNight(floorNo, hour, t)) throw invalidState('tower_night', { openHour: t.openHour });
  if (!test) {
    const total = towerDailyTotal(await getDaily(o.tx, o.rest.id, KEY.ticket, day), t);
    if ((await getDaily(o.tx, o.rest.id, KEY.done, day)) >= total)
      throw limitReached('tower', { max: total });
    if ((await getDaily(o.tx, o.rest.id, KEY.floor(floorNo), day)) >= f.maxTimes)
      throw limitReached('watchman', { max: f.maxTimes, name: f.name });
  }
  spendStrength(o, towerStrength(floorNo, test, t));
  const mc = await o.tx
    .selectFrom('tower_watchman_mc')
    .select('price')
    .where('shard_id', '=', o.shardId)
    .where('floor', '=', floorNo)
    .executeTakeFirst();
  const me = await playerSide(o, 'attack');
  const them = watchmanSide(f, mc?.price ?? 0);
  const r = duel(me, them, t.duel, o.rng);
  let renown = 0;
  const awards: RandomAward[] = [];
  if (!test) {
    renown = towerRenown(floorNo, r.win, t);
    gainRenown(o, renown);
    if (r.win) {
      for (let i = 0; i < floorNo; i++)
        awards.push(await randomAward(o, { level: floorNo + 2, equipFlag: floorNo }));
      // 长老的套装（问题记录 408）：按这一层的概率掉一件，掉哪件平均抽
      const drops = f.elder.drops;
      if (drops.length > 0 && o.rng.next() < (t.elderDropRates[floorNo - 1] ?? 0)) {
        const id = drops[o.rng.int(drops.length)]!;
        await grantGoodsOp(o, id, 1, { source: 'tower.elder' });
        awards.push({ kind: 'goods', id, num: 1, lucky: false });
      }
      if (floorNo > state.best_floor)
        await o.tx
          .updateTable('tower_state')
          .set({ best_floor: floorNo })
          .where('rest_id', '=', o.rest.id)
          .execute();
    }
    await incrementDaily(o.tx, o.rest.id, KEY.done, 1, day);
    await incrementDaily(o.tx, o.rest.id, KEY.floor(floorNo), 1, day);
    await emitAction(o, 'tower.challenge');
  }
  return {
    win: r.win,
    me: sideDto(me, r.me),
    them: sideDto(them, r.them),
    judges: r.judges,
    votes: r.votes,
    renown,
    awards,
    test,
    rank: null,
  };
}
