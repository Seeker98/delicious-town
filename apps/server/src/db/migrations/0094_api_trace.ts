import { sql, type Kysely } from 'kysely';

/**
 * 接口调用记录（用户 2026-10-24 允许存）：认出谁在用脚本、谁在调开放接口。
 * - 登录记录加浏览器标识（User-Agent），记最近一次；脚本发的请求一般不带设备号、标识也不像浏览器
 * - 开放接口按 游戏日 + IP + 标识 + 来源网页 + 带没带 lang 合成一行计次数；和登录记录一样只留 30 天
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table login_trace add column user_agent text`.execute(db);
  await sql`create table open_trace (
    day text not null,
    ip text not null,
    user_agent text not null default '',
    origin text not null default '',
    lang boolean not null,
    n integer not null default 1,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    primary key (day, ip, user_agent, origin, lang)
  )`.execute(db);
  await sql`create index open_trace_last_seen on open_trace (last_seen)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table open_trace`.execute(db);
  await sql`alter table login_trace drop column user_agent`.execute(db);
}
