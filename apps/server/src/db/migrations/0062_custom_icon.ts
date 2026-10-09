import { sql, type Kysely } from 'kysely';

/**
 * 定制称号（问题记录 539，设计 2026-10-09）：后台新建，键是 c<id>，和配置称号共用 rest_icon。
 * 停用的不能再发，已拥有的照样保留
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table custom_icon (
      id integer generated always as identity primary key,
      title text not null,
      descr text,
      note text,
      retired boolean not null default false,
      created_by integer references account(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`.execute(db);
}

/** 回退：定制称号的拥有记录一起删掉（没有定义就显示不出来） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from rest_icon where icon_key ~ '^c[0-9]+$'`.execute(db);
  await sql`drop table custom_icon`.execute(db);
}
