import { sql, type Kysely } from 'kysely';

/**
 * 防小号（2026-10-16：同一 IP、同一设备半小时注册 16 个号刷一番赏豪华池）：
 * - access_ban：后台封的 IP、IP 段、设备号，命中的请求一律拒绝
 * - account.email_canon：查重用的邮箱写法（小写、去掉 + 后缀，Gmail 再去掉点），按它查重，
 *   挡住同一个邮箱换写法注册多个号；老账号按同样的规则补上
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table access_ban (
      id serial primary key,
      kind text not null check (kind in ('ip', 'device')),
      value text not null,
      reason text not null default '',
      actor_account_id integer references account(id) on delete set null,
      created_at timestamptz not null default now(),
      unique (kind, value)
    )`.execute(db);
  await sql`alter table account add column email_canon text`.execute(db);
  await sql`
    update account set email_canon = case
      when split_part(lower(email), '@', 2) in ('gmail.com', 'googlemail.com')
        then replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
      else split_part(split_part(lower(email), '@', 1), '+', 1) || '@' || split_part(lower(email), '@', 2)
    end`.execute(db);
  await sql`create index account_email_canon on account (email_canon)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index account_email_canon`.execute(db);
  await sql`alter table account drop column email_canon`.execute(db);
  await sql`drop table access_ban`.execute(db);
}
