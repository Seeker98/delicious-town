import { sql, type Kysely } from 'kysely';

/**
 * 日常货架的新手格（2026-10-17）：菜场页给它加个标记，事件预测的菜场题不算它。
 * 已经在架上的货都记成不是新手格，下一轮进货起才有标记
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table market_item add column newbie boolean not null default false`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table market_item drop column newbie`.execute(db);
}
