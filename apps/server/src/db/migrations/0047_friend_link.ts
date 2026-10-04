import { sql, type Kysely } from 'kysely';

/** 友情链接（问题记录 348）：全站共用，后台维护 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table friend_link (
      id serial primary key,
      name text not null,
      url text not null,
      note text not null default '',
      sort integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table friend_link`.execute(db);
}
