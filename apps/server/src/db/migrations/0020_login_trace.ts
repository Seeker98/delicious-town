import { sql, type Kysely } from 'kysely';

/** 子项目 6B-2：登录记录，多号检测用（设计 §5）；只留 30 天 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table login_trace (
    account_id integer not null references account(id) on delete cascade,
    ip text not null,
    device_id text,
    device_key text generated always as (coalesce(device_id, '')) stored,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    primary key (account_id, ip, device_key)
  )`.execute(db);
  await sql`create index login_trace_ip on login_trace (ip, last_seen)`.execute(db);
  await sql`create index login_trace_device on login_trace (device_id, last_seen) where device_id is not null`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table login_trace`.execute(db);
}
