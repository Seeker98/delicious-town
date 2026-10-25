import { sql, type Kysely } from 'kysely';

/**
 * 防脚本 PR②（设计 2026-10-25 第 6 节）：后台对可疑号打开“需要人机验证”，带到期时间。
 * 到期前这个账号的写请求每隔一段时间要过一次 Cloudflare 人机验证
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table antibot_challenge (
    account_id integer primary key references account(id) on delete cascade,
    until timestamptz not null,
    note text not null default '',
    actor_account_id integer,
    created_at timestamptz not null default now()
  )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table antibot_challenge`.execute(db);
}
