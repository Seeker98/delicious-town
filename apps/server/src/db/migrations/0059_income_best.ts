import { sql, type Kysely } from 'kysely';

/**
 * 支线“经营”（任务清单第二版）：每家店历史单日最高结算银币、最多营业轮数。
 * 每天的收入汇总只留 14 天，任务要看历史最高，另存一份；两样各取最大，不一定是同一天
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table rest_income_best (
    rest_id integer primary key references restaurant(id) on delete cascade,
    day_coin bigint not null,
    day_rounds integer not null
  )`.execute(db);
  await backfill(db);
}

/** 按还留着的每天收入汇总（最近 14 天）补上；已有的行取较大的 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfill(db: Kysely<any>): Promise<void> {
  await sql`insert into rest_income_best (rest_id, day_coin, day_rounds)
    select rest_id, max(coin), max(rounds) from rest_income_day group by rest_id
    on conflict (rest_id) do update set
      day_coin = greatest(rest_income_best.day_coin, excluded.day_coin),
      day_rounds = greatest(rest_income_best.day_rounds, excluded.day_rounds)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists rest_income_best`.execute(db);
}
