import { sql, type Kysely } from 'kysely';

/** 问题记录 262：服务器私有的随机种子密钥存进数据库，跟着数据库备份走 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table server_secret (
      key text primary key,
      value text not null,
      created_at timestamptz not null default now()
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table server_secret`.execute(db);
}
