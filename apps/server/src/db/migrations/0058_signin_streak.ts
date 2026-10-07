import { sql, type Kysely } from 'kysely';

/**
 * 连续签到（问题记录 515 支线扩充 B）：签到原来只记“今天签没签”（每日计数，只留 30 天）。
 * 一家店一行：最后签到的那天、到那天为止连着签了几天、历史最长
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table signin_streak (
    rest_id integer primary key references restaurant(id) on delete cascade,
    last_day date not null,
    streak integer not null,
    best integer not null
  )`.execute(db);
  await backfill(db);
}

/**
 * 按还留着的每日签到计数（最近 30 天）补上：每段连着的天数，最后一段是现在的连续天数，最长的一段是历史最长。
 * 更早的记录已经清掉了，补不回来；已有的行不动
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfill(db: Kysely<any>): Promise<void> {
  await sql`insert into signin_streak (rest_id, last_day, streak, best)
    select rest_id, max(last_day), (array_agg(n order by last_day desc))[1], max(n)
    from (
      select rest_id, count(*)::int as n, max(day) as last_day
      from (
        select rest_id, day, day - (row_number() over (partition by rest_id order by day))::int as grp
        from daily_counter where key = 'signin' and count > 0
      ) g
      group by rest_id, grp
    ) runs
    group by rest_id
    on conflict do nothing`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists signin_streak`.execute(db);
}
