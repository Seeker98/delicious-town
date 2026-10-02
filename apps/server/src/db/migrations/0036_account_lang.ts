import { sql, type Kysely } from 'kysely';

/** 问题记录 272：账号语言；空表示还没选过 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table account add column lang text check (lang in ('zh-CN', 'zh-TW', 'en', 'fr', 'es'))`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table account drop column lang`.execute(db);
}
