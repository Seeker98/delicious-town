import { sql, type Kysely } from 'kysely';

/**
 * 时令值改法（2026-10-13）：mc_cook 加 shiling_per（下锅时算好的每份时令值，带小数）。
 * 迁移不读配置，不回填：在售的老批次是空的，入账时按配置现算（settlement/runner.ts）。
 * shiling 列（下锅那一刻当令）留着不再读
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table mc_cook add column shiling_per double precision`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table mc_cook drop column shiling_per`.execute(db);
}
