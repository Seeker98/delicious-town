import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';
import { addDays, gameDay } from '@dt/shared';
import type { AcquireStateTable, DB } from '../../db/schema';
import { basePrice, windowDays, type T } from './rules';

export type AcquireStateRow = Selectable<AcquireStateTable>;

/** 基础身价看的区间：今天之前的 priceDays 个完整游戏日 [from, to) */
export function priceWindow(today: string, t: T): { from: string; to: string } {
  return { from: addDays(today, -t.priceDays), to: today };
}

/** 全表最早的汇总日（day 有索引）；一行都没有为 null */
export async function firstIncomeDay(db: Kysely<DB>): Promise<string | null> {
  const r = await db
    .selectFrom('rest_income_day')
    .select((eb) => eb.fn.min('day').as('first'))
    .executeTakeFirst();
  return r?.first ?? null;
}

/** 按近 priceDays 天的收入算一家店的基础身价（不写库）；最早的汇总日一起查，一条查询 */
export async function baseOf(db: Kysely<DB>, restId: number, t: T, now: Date): Promise<number> {
  const w = priceWindow(gameDay(now), t);
  const r = await sql<{ coin: string | number | null; first: string | null }>`
    select (select sum(coin) from rest_income_day
              where rest_id = ${restId} and day >= ${w.from} and day < ${w.to}) as coin,
           (select min(day) from rest_income_day)::text as first`.execute(db);
  const row = r.rows[0];
  return basePrice(Number(row?.coin ?? 0), t, windowDays(w, row?.first ?? null, t));
}

/** 事务里锁住一家店的收购状态 */
export function lockState(tx: Transaction<DB>, restId: number): Promise<AcquireStateRow | undefined> {
  return tx
    .selectFrom('acquire_state')
    .selectAll()
    .where('rest_id', '=', restId)
    .forUpdate()
    .executeTakeFirst();
}

/** 没有行时按近几天的收入算出基础身价建行（今天刚到 2 星、还没跑过每天的任务） */
export async function ensureState(
  db: Kysely<DB>,
  shardId: number,
  restId: number,
  t: T,
  now: Date,
): Promise<AcquireStateRow> {
  const found = await db
    .selectFrom('acquire_state')
    .selectAll()
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  if (found) return found;
  await db
    .insertInto('acquire_state')
    .values({ rest_id: restId, shard_id: shardId, base: await baseOf(db, restId, t, now), heat: 1 })
    .onConflict((oc) => oc.column('rest_id').doNothing())
    .execute();
  return db.selectFrom('acquire_state').selectAll().where('rest_id', '=', restId).executeTakeFirstOrThrow();
}
