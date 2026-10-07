import { sql, type Kysely } from 'kysely';

/**
 * backlog 一轮修复（2026-10-07）：
 * - 收购拦截记下关联的是哪个账号（收购 PR 3 遗留：原来只记买家和目标店，关联的可能是目标店的老板，后台看不出）；旧记录为空
 * - 每日计数按天的索引（问题记录 374 遗留：清理旧计数每批都按 day 全表扫）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table acquire_block add column linked_account_id integer references account(id) on delete set null`.execute(
    db,
  );
  await sql`create index daily_counter_day on daily_counter (day)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index if exists daily_counter_day`.execute(db);
  await sql`alter table acquire_block drop column if exists linked_account_id`.execute(db);
}
