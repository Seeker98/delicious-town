import { sql, type Kysely } from 'kysely';

/** 限时个性图标（240-2 发展基金）：到期时间为空是永久，过期的读的时候当作没有 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table rest_icon add column expires_at timestamptz`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from rest_icon where expires_at is not null`.execute(db);
  await sql`alter table rest_icon drop column expires_at`.execute(db);
}
