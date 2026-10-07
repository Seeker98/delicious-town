import { sql, type Kysely } from 'kysely';

/**
 * 酒吧连胜、连败的每周最高（问题记录 517）：原来的榜按“当前”连胜排，输一局就掉榜。
 * 一家店一种游戏、胜或负、一周一行：这周达到过的最高次数和第一次达到的时间（同样高的先达到的在前）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table bar_streak_best (
    rest_id integer not null references restaurant(id) on delete cascade,
    game text not null,
    result smallint not null,
    week date not null,
    times integer not null,
    reached_at timestamptz not null,
    primary key (rest_id, game, result, week)
  )`.execute(db);
  await sql`create index bar_streak_best_week on bar_streak_best (week, game, result)`.execute(db);
  await backfill(db);
}

/**
 * 上线时把现在保持着的连胜、连败记进本周（终审：不然榜上要等大家再玩一局才有人）。
 * 周按北京时间算，和 weekStart(gameDay(now)) 一样；平局不记，已有的不动
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfill(db: Kysely<any>): Promise<void> {
  await sql`insert into bar_streak_best (rest_id, game, result, week, times, reached_at)
    select s.rest_id, g.game, g.result, date_trunc('week', now() at time zone 'Asia/Shanghai')::date, g.times, now()
    from bar_state s
    cross join lateral (values ('fg', s.fg_result, s.fg_times), ('cup', s.cup_result, s.cup_times),
      ('num', s.num_result, s.num_times)) as g(game, result, times)
    where g.result in (1, -1) and g.times > 0
    on conflict do nothing`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists bar_streak_best`.execute(db);
}
