import { sql, type Kysely } from 'kysely';
import { addDays, gameTime } from '@dt/shared';
import type { GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { initialRef, weightedPrice, type ExchangeTuning } from './rules';

/**
 * 某区服某食材某游戏日的参考价（156-1 设计 §5）：第一次用到时计算并保存，之后不变。
 * 前一天成交不少于 refMinTrades 笔用加权均价，否则沿用最近一天的；都没有用 refOverrides 或 initialRef（问题记录 242）。
 */
export async function refPrice(
  db: Kysely<DB>,
  config: GameConfig,
  t: ExchangeTuning,
  shardId: number,
  foodsId: number,
  day: string,
): Promise<number> {
  const saved = await db
    .selectFrom('exchange_ref')
    .select('price')
    .where('shard_id', '=', shardId)
    .where('foods_id', '=', foodsId)
    .where('day', '=', day)
    .executeTakeFirst();
  if (saved) return saved.price;
  const prev = addDays(day, -1);
  const trades = await db
    .selectFrom('exchange_trade')
    .select(['price', 'qty'])
    .where('shard_id', '=', shardId)
    .where('foods_id', '=', foodsId)
    .where('created_at', '>=', gameTime(prev, 0))
    .where('created_at', '<', gameTime(day, 0))
    .execute();
  let price: number;
  if (trades.length >= t.refMinTrades) price = weightedPrice(trades);
  else {
    const last = await db
      .selectFrom('exchange_ref')
      .select('price')
      .where('shard_id', '=', shardId)
      .where('foods_id', '=', foodsId)
      .where('day', '<', day)
      .orderBy('day', 'desc')
      .executeTakeFirst();
    price = last?.price ?? t.refOverrides[String(foodsId)] ?? initialRef(config.requireFood(foodsId), config);
  }
  await db
    .insertInto('exchange_ref')
    .values({ shard_id: shardId, foods_id: foodsId, day, price })
    .onConflict((oc) => oc.doNothing())
    .execute();
  const row = await db
    .selectFrom('exchange_ref')
    .select('price')
    .where('shard_id', '=', shardId)
    .where('foods_id', '=', foodsId)
    .where('day', '=', day)
    .executeTakeFirstOrThrow();
  return row.price;
}

/**
 * 一次算出多种食材的参考价（交易所列表页用，156-1 终审 I2）：规则和 refPrice 相同。
 * 已保存的一次读出；缺的用一条分组汇总（前一天成交）和一条"最近一天的参考价"补算，再一次写入
 */
export async function refPrices(
  db: Kysely<DB>,
  config: GameConfig,
  t: ExchangeTuning,
  shardId: number,
  foodsIds: number[],
  day: string,
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
    .where('created_at', '>=', gameTime(prev, 0))
    .where('created_at', '<', gameTime(day, 0))
    .groupBy('foods_id')
    .execute();
  const aggBy = new Map(agg.map((x) => [x.foods_id, x]));
  const lastRefs = await db
    .selectFrom('exchange_ref')
    .select(['foods_id', 'price'])
    .distinctOn('foods_id')
    .where('shard_id', '=', shardId)
    .where('foods_id', 'in', missing)
    .where('day', '<', day)
    .orderBy('foods_id')
    .orderBy('day', 'desc')
    .execute();
  const lastBy = new Map(lastRefs.map((x) => [x.foods_id, x.price]));
  const rows = missing.map((id) => {
    const a = aggBy.get(id);
    const price =
      a && Number(a.n) >= t.refMinTrades
        ? Math.round(Number(a.amount) / Number(a.qty))
        : (lastBy.get(id) ?? t.refOverrides[String(id)] ?? initialRef(config.requireFood(id), config));
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
