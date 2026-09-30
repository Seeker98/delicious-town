import { sql, type Kysely } from 'kysely';

/** 试玩问题修复：赶走痞老板后的驻留冷却 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant add column plankton_cooldown_until timestamptz`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant drop column plankton_cooldown_until`.execute(db);
}
