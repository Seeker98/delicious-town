import type { Kysely, Selectable, Transaction } from 'kysely';
import { addDays, gameDay } from '@dt/shared';
import type { AcquireStateTable, DB } from '../../db/schema';
import { incomeSums } from './income';
import { basePrice, type T } from './rules';

export type AcquireStateRow = Selectable<AcquireStateTable>;

/** 基础身价看的区间：今天之前的 priceDays 个完整游戏日 [from, to) */
export function priceWindow(today: string, t: T): { from: string; to: string } {
  return { from: addDays(today, -t.priceDays), to: today };
}

/** 按近 priceDays 天的收入算一家店的基础身价（不写库） */
export async function baseOf(db: Kysely<DB>, restId: number, t: T, now: Date): Promise<number> {
  const w = priceWindow(gameDay(now), t);
  return basePrice((await incomeSums(db, [restId], w.from, w.to)).get(restId) ?? 0, t);
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
