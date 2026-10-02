import { sql, type Kysely } from 'kysely';

/** 问题记录 274：一番赏奖池记下开池时的月度主题 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table kuji_pool add column theme smallint`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table kuji_pool drop column theme`.execute(db);
}
