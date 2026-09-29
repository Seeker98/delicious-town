import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create extension if not exists pg_trgm`,
    sql`create table account (
      id integer generated always as identity primary key,
      username text not null,
      password_hash text not null,
      email text not null,
      email_verified_at timestamptz,
      role text not null default 'player' check (role in ('player', 'admin')),
      banned_at timestamptz,
      invite_code text unique,
      invited_by integer references account(id),
      created_at timestamptz not null default now()
    )`,
    sql`create unique index account_username_lower on account (lower(username))`,
    sql`create unique index account_email on account (email)`,
    sql`create table email_token (
      token_hash text primary key,
      account_id integer not null references account(id) on delete cascade,
      purpose text not null check (purpose in ('verify', 'reset')),
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )`,
    sql`create index email_token_account on email_token (account_id, purpose, created_at desc)`,
    sql`create table shard (
      id integer primary key,
      name text not null,
      status text not null default 'open' check (status in ('open', 'closed')),
      opened_at timestamptz not null default now()
    )`,
    sql`create table shard_config (
      shard_id integer primary key references shard(id),
      override jsonb not null default '{}',
      updated_at timestamptz not null default now()
    )`,
    sql`create table restaurant (
      id integer generated always as identity primary key,
      shard_id integer not null references shard(id),
      account_id integer not null references account(id),
      name text not null,
      level integer not null,
      exp bigint not null default 0,
      coin bigint not null,
      diamond integer not null,
      strength integer not null,
      strength_max integer not null,
      oil integer not null,
      oil_max integer not null,
      oil_level integer not null default 0,
      star_level integer not null default 0,
      street_id integer not null,
      renown integer not null,
      attr_left integer not null,
      attr_cook integer not null default 0,
      attr_cutting integer not null default 0,
      attr_fire integer not null default 0,
      attr_season integer not null default 0,
      attr_creatives integer not null default 0,
      luck integer not null default 0,
      table_num integer not null,
      cupboard_num integer not null,
      store_num integer not null,
      foods_max_num integer not null,
      foods_lock_num integer not null,
      state smallint not null default 1,
      cookbook_counts jsonb not null default '{}',
      effect_agg jsonb not null default '{}',
      effect_next_expire_at timestamptz,
      effect_dirty boolean not null default true,
      created_at timestamptz not null default now(),
      constraint restaurant_shard_account unique (shard_id, account_id)
    )`,
    sql`create unique index restaurant_shard_name on restaurant (shard_id, name)`,
    sql`create index restaurant_name_trgm on restaurant using gin (name gin_trgm_ops)`,
    sql`create table restaurant_tables (
      rest_id integer primary key references restaurant(id) on delete cascade,
      round_no bigint not null default 0,
      tables jsonb not null
    )`,
    sql`create table restaurant_cookbooks (
      rest_id integer primary key references restaurant(id) on delete cascade,
      levels bytea not null
    )`,
    sql`create table effect_source (
      id bigint generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      source_type text not null,
      source_id integer not null,
      effects jsonb not null,
      expires_at timestamptz,
      created_at timestamptz not null default now(),
      unique (rest_id, source_type, source_id)
    )`,
    sql`create table store_item (
      rest_id integer not null references restaurant(id) on delete cascade,
      goods_id integer not null,
      num integer not null check (num >= 0),
      acquired_at timestamptz not null default now(),
      expires_at timestamptz,
      primary key (rest_id, goods_id)
    )`,
    sql`create table daily_counter (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      key text not null,
      count integer not null default 0,
      primary key (rest_id, day, key)
    )`,
    sql`create table ledger (
      id bigint generated always as identity,
      rest_id integer not null,
      kind text not null,
      item_id integer,
      delta bigint not null,
      source text not null,
      ref_rest_id integer,
      created_at timestamptz not null default now(),
      primary key (id, created_at)
    ) partition by range (created_at)`,
    sql`create index ledger_rest_time on ledger (rest_id, created_at desc)`,
    sql`create table ledger_default partition of ledger default`,
    sql`create table news (
      id bigint generated always as identity,
      shard_id integer not null,
      type text not null,
      rest_id integer,
      params jsonb not null default '{}',
      created_at timestamptz not null default now(),
      primary key (id, created_at)
    ) partition by range (created_at)`,
    sql`create index news_shard_time on news (shard_id, created_at desc)`,
    sql`create table news_default partition of news default`,
    sql`create table audit_log (
      id bigint generated always as identity primary key,
      actor_account_id integer,
      action text not null,
      target text,
      detail jsonb not null default '{}',
      ip text,
      created_at timestamptz not null default now()
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of [
    'audit_log',
    'news',
    'ledger',
    'daily_counter',
    'store_item',
    'effect_source',
    'restaurant_cookbooks',
    'restaurant_tables',
    'restaurant',
    'shard_config',
    'shard',
    'email_token',
    'account',
  ]) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
