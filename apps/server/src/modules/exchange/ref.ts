import type { Kysely } from 'kysely';
import { addDays, gameTime } from '@dt/shared';
import type { GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { weightedPrice, type ExchangeTuning } from './rules';

/**
 * 某区服某食材某游戏日的参考价（156-1 设计 §5）：第一次用到时计算并保存，之后不变。
 * 前一天成交不少于 refMinTrades 笔用加权均价，否则沿用最近一天的；都没有用 refOverrides 或系统定价。
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
    price = last?.price ?? t.refOverrides[String(foodsId)] ?? config.requireFood(foodsId).coin;
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
