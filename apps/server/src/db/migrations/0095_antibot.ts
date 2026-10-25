import { sql, type Kysely } from 'kysely';

/**
 * 游戏接口防脚本（设计 2026-10-25）：
 * - antibot_whitelist：拦截模式下也不拦的账号（用户自己的号、帮用户干活的 AI 工具），照样记录
 * - play_rhythm：按 账号 × 小时 汇总的操作节奏（worker 每小时从 Redis 写进来），保留 30 天
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table antibot_whitelist (
    account_id integer primary key references account(id) on delete cascade,
    note text not null default '',
    actor_account_id integer,
    created_at timestamptz not null default now()
  )`.execute(db);
  await sql`create table play_rhythm (
    account_id integer not null,
    hour timestamptz not null,
    posts integer not null default 0,
    gets integer not null default 0,
    routes jsonb not null default '{}',
    gap_n integer not null default 0,
    gap_sum bigint not null default 0,
    gap_sq double precision not null default 0,
    gap_min integer,
    bursts integer not null default 0,
    no_view integer not null default 0,
    idle_long integer not null default 0,
    verdicts jsonb not null default '{}',
    uas integer not null default 0,
    devices integer not null default 0,
    ips integer not null default 0,
    primary key (account_id, hour)
  )`.execute(db);
  await sql`create index play_rhythm_hour on play_rhythm (hour)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table play_rhythm`.execute(db);
  await sql`drop table antibot_whitelist`.execute(db);
}
