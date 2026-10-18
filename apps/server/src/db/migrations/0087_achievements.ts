import { sql, type Kysely } from 'kysely';

/**
 * 成就系统（设计稿 2026-10-19-achievements-design.md，PR①）：
 * - rest_achievement：达成的成就（编号见配置 designed/achievements），backfilled 是上线补发的（不进动态、不算首达）
 * - rest_ach：每家店的成就点、达到当前点数的时间（排行同分先到的在前）、展示柜里的奖杯。
 *   单独一张表，不放 restaurant：别的店的动作（换食材、加油）也会给这家店加成就，不去锁对方的餐厅行
 * - ach_shard：区服补发完的时间。补发完以前不算首达、不发新闻（不然上线头一分钟谁先动谁拿首达）
 * - 补几个新计数（event_counter）：配置不在迁移里，成就本身由 worker 的补发任务按配置算，这里只把
 *   以后要靠计数、现在只有明细的几样先算出来（明细会被清：每日营业汇总留 14 天、动态留 30 天、酒吧连胜留 3 周）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table rest_achievement (
      rest_id integer not null references restaurant(id) on delete cascade,
      ach_id text not null,
      pts integer not null,
      achieved_at timestamptz not null,
      backfilled boolean not null default false,
      first_in_shard boolean not null default false,
      primary key (rest_id, ach_id)
    )`.execute(db);
  await sql`create index rest_achievement_ach on rest_achievement (ach_id)`.execute(db);
  await sql`create index rest_achievement_at on rest_achievement (achieved_at)`.execute(db);
  await sql`
    create table rest_ach (
      rest_id integer primary key references restaurant(id) on delete cascade,
      points integer not null default 0,
      points_at timestamptz,
      shelf jsonb not null default '[]'::jsonb
    )`.execute(db);
  await sql`
    create table ach_shard (
      shard_id integer primary key references shard(id) on delete cascade,
      backfilled_at timestamptz not null
    )`.execute(db);
  await backfillCounters(db);
}

/** 只给测试用：限定店（测试库是共用的）；迁移本身不传，处理全部 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfillCounters(db: Kysely<any>, restIds: number[] | null = null): Promise<void> {
  const only = (col: string) =>
    restIds === null
      ? sql``
      : restIds.length > 0
        ? sql` and ${sql.ref(col)} in (${sql.join(restIds)})`
        : sql` and false`;
  const put = (select: ReturnType<typeof sql>) => sql`
    insert into event_counter (rest_id, key, count) ${select}
    on conflict (rest_id, key) do update set count = greatest(event_counter.count, excluded.count)`;
  // 累计营业银币、轮数：每日汇总 + 还没汇总进去的那几天的每轮记录（结算银币是让渡给老板以前的数，和汇总一致）
  for (const [key, col] of [
    ['income.coin', 'coin'],
    ['income.rounds', 'rounds'],
  ] as const) {
    await put(sql`
      select rest_id, ${key}::text, sum(v) from (
        select rest_id, ${sql.ref(col)}::bigint as v from rest_income_day where true${only('rest_id')}
        union all
        select i.rest_id, ${col === 'coin' ? sql`i.coin::bigint` : sql`1::bigint`} from income_round i
        where not exists (select 1 from rest_income_day d where d.rest_id = i.rest_id
          and d.day = (i.created_at at time zone 'Asia/Shanghai')::date)${only('i.rest_id')}
      ) x group by rest_id having sum(v) > 0`).execute(db);
  }
  // 划拳最长连胜、连败（每周最高只留 3 周）
  for (const [key, result] of [
    ['streak.fg.win', 1],
    ['streak.fg.lose', -1],
  ] as const) {
    await put(sql`
      select rest_id, ${key}::text, max(times) from bar_streak_best
      where game = 'fg' and result = ${result}${only('rest_id')} group by rest_id`).execute(db);
  }
  // 原来只写动态的几样（动态留 30 天，开服以来的都还在）
  for (const [key, type] of [
    ['futures.delivered', 'futures.delivered'],
    ['mouse.trap', 'mouse.trap'],
    ['plankton.driven', 'plankton.driven'],
    ['krab.happy', 'krab.happy'],
  ] as const) {
    await put(sql`
      select rest_id, ${key}::text, count(*) from rest_log where type = ${type}${only('rest_id')} group by rest_id`).execute(
      db,
    );
  }
  await put(sql`
    select rest_id, 'mc.champion', count(*) from rest_log
    where type = 'mc.champion' and params->>'rank' = '1'${only('rest_id')} group by rest_id`).execute(db);
  await put(sql`
    select rest_id, 'town.talk.' || (params->>'npc'), count(*) from rest_log
    where type = 'town.talk' and params ? 'npc'${only('rest_id')} group by rest_id, params->>'npc'`).execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table ach_shard`.execute(db);
  await sql`drop table rest_ach`.execute(db);
  await sql`drop table rest_achievement`.execute(db);
}
