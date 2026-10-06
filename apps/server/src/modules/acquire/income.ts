import { sql, type Kysely } from 'kysely';
import { addDays, gameTime } from '@dt/shared';
import type { DB } from '../../db/schema';

/** 每天的收入留几天：基础身价看 7 天、分红封顶看 7 天，多留一周给后台查 */
export const INCOME_KEEP_DAYS = 14;

/**
 * 把本区服每家店某个游戏日的结算银币、轮数从 income_round 汇总进 rest_income_day（收购 PR 1）。
 * income_round 只留 3 天，所以要另存；同一天重跑覆盖成同样的结果。返回写了几家店
 */
export async function aggregateIncomeDay(db: Kysely<DB>, shardId: number, day: string): Promise<number> {
  const from = gameTime(day, 0);
  const to = gameTime(addDays(day, 1), 0);
  const r = await sql`
    insert into rest_income_day (rest_id, day, coin, rounds)
    select i.rest_id, ${day}::date, sum(i.coin), count(*)
    from income_round i
    where i.created_at >= ${from} and i.created_at < ${to}
      and i.rest_id in (select id from restaurant where shard_id = ${shardId})
    group by i.rest_id
    on conflict (rest_id, day) do update set coin = excluded.coin, rounds = excluded.rounds`.execute(db);
  return Number(r.numAffectedRows ?? 0);
}

/** 删掉 before 以前的每天收入 */
export async function pruneIncomeDays(db: Kysely<DB>, before: string): Promise<number> {
  const r = await db.deleteFrom('rest_income_day').where('day', '<', before).executeTakeFirst();
  return Number(r.numDeletedRows);
}

/** 这些店在 [fromDay, toDay) 的结算银币合计；没有记录的店不在结果里 */
export async function incomeSums(
  db: Kysely<DB>,
  restIds: number[],
  fromDay: string,
  toDay: string,
): Promise<Map<number, number>> {
  if (restIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('rest_income_day')
    .select(['rest_id', (eb) => eb.fn.sum<number>('coin').as('coin')])
    .where('rest_id', 'in', restIds)
    .where('day', '>=', fromDay)
    .where('day', '<', toDay)
    .groupBy('rest_id')
    .execute();
  return new Map(rows.map((r) => [r.rest_id, Number(r.coin)]));
}
