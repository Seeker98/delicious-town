import { sql, type Kysely } from 'kysely';

/**
 * 特色菜限速（docs/design/特色菜限速-方案-2026-11-21.md §3.2）：挑剔顾客、普通顾客每轮应卖份数的零头，
 * 留到这一锅的下一轮；已有的批次按 0 处理，新下锅的一批从 0 开始
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table mc_cook add column picky_carry double precision not null default 0`.execute(db);
  await sql`alter table mc_cook add column normal_carry double precision not null default 0`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table mc_cook drop column normal_carry`.execute(db);
  await sql`alter table mc_cook drop column picky_carry`.execute(db);
}
