import { sql, type Kysely } from 'kysely';
import { gameDay } from '@dt/shared';
import type { DB } from '../../db/schema';

/** 每日计数加 by，返回累加后的值（插入或累加一条语句完成） */
export async function incrementDaily(
  db: Kysely<DB>,
  restId: number,
  key: string,
  by = 1,
  day: string = gameDay(),
): Promise<number> {
  const row = await db
    .insertInto('daily_counter')
    .values({ rest_id: restId, day, key, count: by })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'day', 'key']).doUpdateSet({ count: sql<number>`daily_counter.count + ${by}` }),
    )
    .returning('count')
    .executeTakeFirstOrThrow();
  return row.count;
}

export async function getDaily(
  db: Kysely<DB>,
  restId: number,
  key: string,
  day: string = gameDay(),
): Promise<number> {
  const row = await db
    .selectFrom('daily_counter')
    .select('count')
    .where('rest_id', '=', restId)
    .where('day', '=', day)
    .where('key', '=', key)
    .executeTakeFirst();
  return row?.count ?? 0;
}
