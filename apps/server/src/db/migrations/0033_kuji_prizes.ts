import { sql, type Kysely } from 'kysely';

/** 一番赏终审 I1：开池时把奖品配置快照存进池，改区服数值只影响下一池 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table kuji_pool add column tiers jsonb, add column last jsonb`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table kuji_pool drop column last, drop column tiers`.execute(db);
}
