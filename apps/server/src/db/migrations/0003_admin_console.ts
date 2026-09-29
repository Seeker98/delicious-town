import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`alter table account drop constraint account_role_check`,
    sql`alter table account add constraint account_role_check check (role in ('player', 'mod', 'admin'))`,
    sql`alter table account add column ban_reason text`,
    sql`alter table shard_config add column version integer not null default 0`,
    sql`create table shard_config_history (
      id bigint generated always as identity primary key,
      shard_id integer not null references shard(id),
      version integer not null,
      override jsonb not null,
      actor_account_id integer references account(id),
      note text not null,
      created_at timestamptz not null default now(),
      unique (shard_id, version)
    )`,
    sql`create table admin_grant (
      id bigint generated always as identity primary key,
      shard_id integer not null references shard(id),
      target text not null check (target in ('rest', 'shard')),
      rest_id integer,
      min_level integer,
      items jsonb not null,
      reason text not null,
      status text not null check (status in ('pending', 'running', 'done', 'failed')),
      total integer not null default 0,
      done_count integer not null default 0,
      failed_count integer not null default 0,
      actor_account_id integer references account(id),
      created_at timestamptz not null default now(),
      finished_at timestamptz
    )`,
    sql`create index admin_grant_open on admin_grant (id) where status in ('pending', 'running')`,
    sql`create table admin_grant_done (
      grant_id bigint not null references admin_grant(id) on delete cascade,
      rest_id integer not null,
      ok boolean not null,
      error text,
      created_at timestamptz not null default now(),
      primary key (grant_id, rest_id)
    )`,
    sql`create table stat_daily (
      shard_id integer not null references shard(id),
      day date not null,
      kind text not null,
      source text not null,
      amount bigint not null,
      primary key (shard_id, day, kind, source)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['stat_daily', 'admin_grant_done', 'admin_grant', 'shard_config_history']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
  await sql`alter table shard_config drop column version`.execute(db);
  await sql`alter table account drop column ban_reason`.execute(db);
  await sql`update account set role = 'player' where role = 'mod'`.execute(db);
  await sql`alter table account drop constraint account_role_check`.execute(db);
  await sql`alter table account add constraint account_role_check check (role in ('player', 'admin'))`.execute(
    db,
  );
}
