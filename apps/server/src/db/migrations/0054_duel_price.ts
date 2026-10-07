import { sql, type Kysely } from 'kysely';

/**
 * 对决不吃试炼价值（用户 2026-10-07 定）：烹制时另存一份不含试炼价值的每份价值，厨塔和好友对决用它。
 * 以前做的为空，对决照旧用 price，卖完就过渡完了
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table mc_cook add column duel_price integer`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table mc_cook drop column if exists duel_price`.execute(db);
}
