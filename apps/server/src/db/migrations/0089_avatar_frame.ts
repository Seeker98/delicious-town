import { sql, type Kysely } from 'kysely';

/**
 * 成就 PR③（设计稿 2026-10-19-achievements-design.md §5.4）：头像框。
 * 解锁哪几种按成就点算（成就点只涨不跌），店里只存戴的是哪个（配置 looks.frames 的编号，空 = 不戴）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant add column frame smallint`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant drop column frame`.execute(db);
}
