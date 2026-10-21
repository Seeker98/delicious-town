import { sql, type Kysely } from 'kysely';

/**
 * 冰箱收费（2026-10-22）：欠的冰箱费用（入库费、仓储费）和从哪个游戏日开始欠；
 * 连续欠满 fridgeDebtDays 天就用冰箱里的食材抵债
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant add column fridge_debt bigint not null default 0`.execute(db);
  await sql`alter table restaurant add column fridge_debt_since date`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant drop column fridge_debt_since`.execute(db);
  await sql`alter table restaurant drop column fridge_debt`.execute(db);
}
