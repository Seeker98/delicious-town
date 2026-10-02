import { sql, type Kysely } from 'kysely';

/** 238-1 终审：作废时的退款比例（退款总额不超过系统在这个事件的净收入） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table predict_event add column void_ratio double precision`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table predict_event drop column void_ratio`.execute(db);
}
