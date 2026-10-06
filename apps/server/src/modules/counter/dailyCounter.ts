import { sql, type Kysely } from 'kysely';
import { addDays, gameDay } from '@dt/shared';
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

/**
 * 删掉 keepDays 天以前的每日计数（backlog 374：原来没有清理，表每天按“玩家 × 动作”涨）。
 * 读得最远的是上周的排行、周奖励（13 天内），留 30 天足够。分批删，一次不锁太多行；返回删了几行
 */
export async function pruneDailyCounters(
  db: Kysely<DB>,
  now: Date,
  keepDays = 30,
  batch = 5000,
): Promise<number> {
  const cutoff = addDays(gameDay(now), -keepDays);
  let total = 0;
  for (;;) {
    const r = await sql`delete from daily_counter where ctid in (
      select ctid from daily_counter where day < ${cutoff} limit ${batch})`.execute(db);
    const n = Number(r.numAffectedRows ?? 0);
    total += n;
    if (n < batch) return total;
  }
}
