import { sql, type Kysely } from 'kysely';

/** 子项目 6B-1：举报（按被举报的内容建案）、封号期限（设计 §3.1、§4） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table report_case (
    id serial primary key,
    shard_id integer not null references shard(id) on delete cascade,
    target_type text not null check (target_type in ('post', 'reply', 'broadcast', 'rest_name', 'notice')),
    target_id integer not null,
    target_rest_id integer not null references restaurant(id) on delete cascade,
    target_account_id integer not null references account(id) on delete cascade,
    snapshot text not null,
    status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
    reporter_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    handled_by integer references account(id),
    handled_at timestamptz,
    action text,
    ban_days integer,
    note text
  )`.execute(db);
  await sql`create unique index report_case_open on report_case (target_type, target_id) where status = 'open'`.execute(
    db,
  );
  await sql`create index report_case_list on report_case (shard_id, status, updated_at desc)`.execute(db);
  await sql`create table report_entry (
    id serial primary key,
    case_id integer not null references report_case(id) on delete cascade,
    reporter_account_id integer not null references account(id) on delete cascade,
    reporter_rest_id integer not null references restaurant(id) on delete cascade,
    reason text not null check (reason in ('abuse', 'porn', 'ad', 'politics', 'other')),
    detail text not null default '',
    created_at timestamptz not null default now(),
    unique (case_id, reporter_account_id)
  )`.execute(db);
  await sql`create index report_entry_reporter on report_entry (reporter_account_id, created_at)`.execute(db);
  await sql`alter table account add column banned_until timestamptz`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table account drop column banned_until`.execute(db);
  await sql`drop table report_entry`.execute(db);
  await sql`drop table report_case`.execute(db);
}
