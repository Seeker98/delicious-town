import type { Kysely } from 'kysely';
import { GOODS, type GameConfig } from '@dt/config';
import { gameDay, type BarDto } from '@dt/shared';
import type { DB, RestaurantRow } from '../../db/schema';
import { getDailies } from '../counter/dailyCounter';
import { resultDto } from './common';
import { devilView, type DevilState } from './devil';
import { memoryResume, type MemoryState } from './memory';
import { nimTables, nimView, type NimState } from './nim';
import { dealView, type DealState } from './deal';
import { peekRounds } from './round';
import { spiceTiers, spiceView, type SpiceState } from './spice';
import { cupTiers, cupView, type CupState } from './cup';
import { slotFloorLeft, type BarTuning } from './rules';

export async function barView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  t: BarTuning,
  now: Date,
): Promise<BarDto> {
  const day = gameDay(now);
  // 互不依赖的查询一起发（性能第二轮：原来一条接一条，开发服 17 毫秒左右）。只从连接池调用，不在事务里
  // 进行中的局、每日次数各一条查询（最后一颗糖加进来以后查询条数不变）
  const [s, items, acc, stats, rounds, daily] = await Promise.all([
    db.selectFrom('bar_state').selectAll().where('rest_id', '=', rest.id).executeTakeFirst(),
    db
      .selectFrom('store_item')
      .select(['goods_id', 'num', 'expires_at'])
      .where('rest_id', '=', rest.id)
      .where('goods_id', 'in', [GOODS.mysteryTicket, GOODS.krabCoin, GOODS.magicLamp])
      .execute(),
    db
      .selectFrom('account')
      .select('email_verified_at')
      .where('id', '=', rest.account_id)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('bar_slot_stat')
      .select(['award_id', 'num'])
      .where('rest_id', '=', rest.id)
      .orderBy('award_id')
      .execute(),
    peekRounds(db, rest.id),
    getDailies(db, rest.id, ['bar.memory', 'bar.darts', 'bar.nim', 'bar.spice', 'bar.deal'], day),
  ]);
  const devil = rounds.devil as DevilState | undefined;
  const memory = rounds.memory as MemoryState | undefined;
  const darts = rounds.darts as { throws: number[]; aim: unknown } | undefined;
  const nim = rounds.nim as NimState | undefined;
  const spice = rounds.spice as SpiceState | undefined;
  const deal = rounds.deal as DealState | undefined;
  const cup = rounds.cup as CupState | undefined;
  const have = (id: number) => {
    const r = items.find((x) => x.goods_id === id);
    return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
  };
  const total = config.slotPool.total;
  return {
    tickets: have(GOODS.mysteryTicket),
    coin: rest.coin,
    krabCoins: have(GOODS.krabCoin),
    fg: { result: resultDto(s?.fg_result ?? null), times: s?.fg_times ?? 0 },
    cup: {
      result: resultDto(s?.cup_result ?? null),
      times: s?.cup_times ?? 0,
      cost: t.cup.cost,
      cups: t.cup.cups,
      tiers: cupTiers(t.cup),
      // 区服数值把轮数改少了时，超出的旧局不给前端（下次操作时作废）
      round: cup && cup.round < t.cup.cups.length ? cupView(cup, t.cup) : null,
    },
    num: {
      result: resultDto(s?.num_result ?? null),
      times: s?.num_times ?? 0,
      cost: t.numCost,
      max: t.numMax,
    },
    slot: {
      emailVerified: acc.email_verified_at !== null,
      lamp: have(GOODS.magicLamp) > 0,
      floorLeft: slotFloorLeft(s?.slot_fail ?? 0, t),
      pool: config.slotPool.items.map((a) => ({
        id: a.id,
        kind: a.kind,
        itemId: a.itemId,
        rate: a.odds / total,
        rare: a.rare,
      })),
      stats: stats.map((x) => ({ awardId: x.award_id, num: x.num })),
    },
    krabCoinTickets: t.krabCoinTickets,
    devil: { stakes: t.devil.stakes, round: devil ? devilView(devil) : null },
    memory: {
      cost: t.memory.cost,
      played: daily['bar.memory']!,
      max: t.memory.dailyMax,
      flashMs: t.memory.flashMs,
      gapMs: t.memory.gapMs,
      round: memory ? memoryResume(memory, t.memory, now) : null,
    },
    darts: {
      cost: t.darts.cost,
      played: daily['bar.darts']!,
      max: t.darts.dailyMax,
      round: darts ? { throws: darts.throws, aiming: darts.aim !== null } : null,
    },
    nim: {
      played: daily['bar.nim']!,
      max: t.nim.dailyMax,
      tables: nimTables(t.nim),
      round: nim ? nimView(nim) : null,
    },
    spice: {
      cost: t.spice.cost,
      played: daily['bar.spice']!,
      max: t.spice.dailyMax,
      kinds: t.spice.kinds,
      length: t.spice.length,
      tries: t.spice.tries,
      tiers: spiceTiers(t.spice),
      round: spice ? spiceView(spice, t.spice) : null,
    },
    deal: {
      cost: t.deal.cost,
      played: daily['bar.deal']!,
      max: t.deal.dailyMax,
      count: t.deal.prizes.length,
      opens: t.deal.opens,
      prizes: t.deal.prizes,
      round: deal ? dealView(deal) : null,
    },
  };
}
