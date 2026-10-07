import type { Kysely } from 'kysely';
import { GOODS, type Bless, type GameConfig } from '@dt/config';
import {
  ErrorCode,
  gameDay,
  pickWeighted,
  type BlessDto,
  type FeastResultDto,
  type TownRewardDto,
  type WishResultDto,
} from '@dt/shared';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { emitAction } from '../../core/action';
import { opNews, restLog, type Op } from '../../core/op';
import { gainCoin, gainDiamond } from '../../core/resources';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { incrementDaily } from '../counter/dailyCounter';
import { addFoods, addFoodsMany } from '../cupboard/foods';
import { countGoods, grantGoodsOp } from '../store/goods';
import { activationPoints } from './common';
import { blessFoodIds, feastAmount, pickDistinct } from './rules';

export function blessDto(b: Bless): BlessDto {
  return {
    id: b.id,
    name: b.name,
    type: b.type,
    num: b.num,
    needAct: b.needAct,
    levels: b.levels,
    goodsId: b.goodsId,
    buff: b.buff,
  };
}

/** 本区服今天（按 now 的游戏日）的星愿 */
export async function todayBless(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  now: Date,
): Promise<{ bless: Bless; restId: number } | null> {
  const r = await db
    .selectFrom('town_bless')
    .select(['bless_id', 'rest_id'])
    .where('shard_id', '=', shardId)
    .where('day', '=', gameDay(now))
    .executeTakeFirst();
  const b = r ? config.bless.get(r.bless_id) : undefined;
  return r && b ? { bless: b, restId: r.rest_id } : null;
}

/** 结算用：今天的星愿加成，没有时为 {} */
export async function blessBuff(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  now: Date,
): Promise<Record<string, number>> {
  return (await todayBless(db, config, shardId, now))?.bless.buff ?? {};
}

/** 许愿：持有神灯（不消耗）；主键 (区服, 游戏日) 保证每天只有第一个人生效 */
export async function wish(o: Op): Promise<WishResultDto> {
  const have = await countGoods(o, GOODS.magicLamp);
  if (have < 1) throw notEnough('goods', 1, have, GOODS.magicLamp);
  const b = pickWeighted(o.config.blessPool, o.rng);
  const ins = await o.tx
    .insertInto('town_bless')
    .values({
      shard_id: o.shardId,
      day: gameDay(o.now),
      bless_id: b.id,
      rest_id: o.rest.id,
      created_at: o.now,
    })
    .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
    .returning('bless_id')
    .executeTakeFirst();
  if (!ins) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'wish' });
  // 星愿名不放 name：name 是"店名缺失时的兜底"字段（PR26 遗留）
  opNews(o, 'town.bless', { blessId: b.id, blessName: b.name });
  restLog(o, 'town.wish', { blessId: b.id });
  await emitAction(o, 'town.wish');
  return { bless: blessDto(b) };
}

/** 共飨：检查顺序 有星愿 → 活跃度 → 今天没领过 → 发奖 */
export async function feast(o: Op, foodsId?: number): Promise<FeastResultDto> {
  const day = gameDay(o.now);
  const today = await todayBless(o.tx, o.config, o.shardId, o.now);
  if (!today) throw invalidState('no_bless');
  const b = today.bless;
  const act = await activationPoints(o.tx, o.config, o.rest.id, day);
  if (act < b.needAct) throw requirement('activation', { need: b.needAct, have: act });
  if ((await incrementDaily(o.tx, o.rest.id, 'town.feast', 1, day)) > 1)
    throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'feast' });
  const lamp = (await countGoods(o, GOODS.magicLamp)) > 0;
  const n = feastAmount(b, lamp, o.tuning.town.bless.lampCoinBonus);
  const rewards: TownRewardDto[] = [];
  if (b.type === 5) {
    const ids = pickDistinct(blessFoodIds(o.config, b.levels!), n, o.rng);
    await addFoodsMany(o, new Map(ids.map((id) => [id, 1])));
    for (const id of ids) rewards.push({ kind: 'foods', id, num: 1 });
  } else if (b.type === 0) {
    if (foodsId === undefined || !blessFoodIds(o.config, b.levels!).includes(foodsId))
      throw invalidState('foods_not_allowed', { foodsId: foodsId ?? null });
    const got = await addFoods(o, foodsId, n);
    rewards.push({ kind: 'foods', id: foodsId, num: got.toCupboard + got.toFridge });
  } else if (b.type === 2) {
    rewards.push({ kind: 'goods', id: b.goodsId, num: await grantGoodsOp(o, b.goodsId!, n) });
  } else if (b.type === 3) {
    gainCoin(o, n);
    rewards.push({ kind: 'coin', id: null, num: n });
  } else {
    gainDiamond(o, n);
    rewards.push({ kind: 'diamond', id: null, num: n });
  }
  restLog(o, 'town.feast', { blessId: b.id, rewards });
  return { rewards };
}
