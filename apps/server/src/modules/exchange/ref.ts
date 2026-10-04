import { sql, type Kysely } from 'kysely';
import { addDays, gameTime } from '@dt/shared';
import type { GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { initialRef, type ExchangeTuning } from './rules';

/** 前一天没保存参考价时最多往前补算几天（backlog 156-1）；更早的空档沿用最近一天保存的 */
export const REF_BACKFILL_DAYS = 7;

/**
 * 某区服某食材某游戏日的参考价（156-1 设计 §5）：第一次用到时计算并保存，之后不变（和系统的成交不算，156-3）。
 * 规则见 refPrices；单个和批量走同一套，结果一致
 */
export async function refPrice(
  db: Kysely<DB>,
  config: GameConfig,
  t: ExchangeTuning,
  rates: readonly number[],
  shardId: number,
  foodsId: number,
  day: string,
): Promise<number> {
  return (await refPrices(db, config, t, rates, shardId, [foodsId], day)).get(foodsId)!;
}

/**
 * 一次算出多种食材的参考价（交易所列表页用，156-1 终审 I2）。
 * 前一天成交不少于 refMinTrades 笔用加权均价，否则沿用前一天的参考价；都没有用 refOverrides 或 initialRef（问题记录 242）。
 * 前一天没人打开交易所、没保存参考价时，先补算前一天的（最多往前 REF_BACKFILL_DAYS 天），
 * 免得跳过更早一天的成交均价（backlog 156-1）
 */
export async function refPrices(
  db: Kysely<DB>,
  config: GameConfig,
  t: ExchangeTuning,
  /** 食材等级价格倍数（240-1），没有成交时的初始参考价按它放大 */
  rates: readonly number[],
  shardId: number,
  foodsIds: number[],
  day: string,
  depth = 0,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (foodsIds.length === 0) return out;
  const read = async (ids: number[]) => {
    const rows = await db
      .selectFrom('exchange_ref')
      .select(['foods_id', 'price'])
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .where('foods_id', 'in', ids)
      .execute();
    for (const r of rows) out.set(r.foods_id, r.price);
  };
  await read(foodsIds);
  const missing = foodsIds.filter((id) => !out.has(id));
  if (missing.length === 0) return out;
  const prev = addDays(day, -1);
  const agg = await db
    .selectFrom('exchange_trade')
    .select([
      'foods_id',
      sql<string>`count(*)`.as('n'),
      sql<string>`sum(price::bigint * qty)`.as('amount'),
      sql<string>`sum(qty)`.as('qty'),
    ])
    .where('shard_id', '=', shardId)
    .where('foods_id', 'in', missing)
    .where('system', '=', false)
    .where('created_at', '>=', gameTime(prev, 0))
    .where('created_at', '<', gameTime(day, 0))
    .groupBy('foods_id')
    .execute();
  const aggBy = new Map(agg.map((x) => [x.foods_id, x]));
  const enough = (id: number) => Number(aggBy.get(id)?.n ?? 0) >= t.refMinTrades;
  const thin = missing.filter((id) => !enough(id));
  const lastBy = new Map<number, { day: string; price: number }>();
  if (thin.length > 0) {
    const lastRefs = await db
      .selectFrom('exchange_ref')
      .select(['foods_id', 'price', sql<string>`day::text`.as('day')])
      .distinctOn('foods_id')
      .where('shard_id', '=', shardId)
      .where('foods_id', 'in', thin)
      .where('day', '<', day)
      .orderBy('foods_id')
      .orderBy('day', 'desc')
      .execute();
    for (const x of lastRefs) lastBy.set(x.foods_id, { day: x.day, price: x.price });
  }
  // 有更早的参考价、但前一天没保存的：先补算前一天（它会再看前一天的成交），一直补到有保存的那天为止
  const gap = thin.filter((id) => {
    const last = lastBy.get(id);
    return last !== undefined && last.day < prev;
  });
  const filled =
    gap.length > 0 && depth < REF_BACKFILL_DAYS
      ? await refPrices(db, config, t, rates, shardId, gap, prev, depth + 1)
      : new Map<number, number>();
  const rows = missing.map((id) => {
    const a = aggBy.get(id);
    const price =
      a && enough(id)
        ? Math.round(Number(a.amount) / Number(a.qty))
        : (filled.get(id) ??
          lastBy.get(id)?.price ??
          t.refOverrides[String(id)] ??
          initialRef(config.requireFood(id), config, rates));
    return { shard_id: shardId, foods_id: id, day, price };
  });
  await db
    .insertInto('exchange_ref')
    .values(rows)
    .onConflict((oc) => oc.doNothing())
    .execute();
  await read(missing);
  return out;
}
