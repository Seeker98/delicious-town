import { sql, type Kysely } from 'kysely';

/** 限时活动 148-1（设计 §3.1） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table activity (
    id serial primary key,
    shard_id integer references shard(id) on delete cascade,
    kind text not null check (kind in ('goals', 'grid', 'pass')),
    title text not null,
    body text not null,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    min_level integer not null default 1,
    def jsonb not null,
    actor_account_id integer references account(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    check (ends_at > starts_at)
  )`.execute(db);
  await sql`create index activity_shard_ends on activity (shard_id, ends_at) where deleted_at is null`.execute(
    db,
  );
  await sql`create table activity_counter (
    activity_id integer not null references activity(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    key text not null,
    count bigint not null default 0,
    primary key (activity_id, rest_id, key)
  )`.execute(db);
  await sql`create table activity_claim (
    activity_id integer not null references activity(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    reward_key text not null,
    via text not null check (via in ('page', 'mail')),
    claimed_at timestamptz not null default now(),
    primary key (activity_id, rest_id, reward_key)
  )`.execute(db);
  await sql`create table activity_pass (
    activity_id integer not null references activity(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    unlocked_at timestamptz not null default now(),
    primary key (activity_id, rest_id)
  )`.execute(db);
  await sql`create table activity_settle (
    activity_id integer not null references activity(id) on delete cascade,
    shard_id integer not null references shard(id) on delete cascade,
    settled_at timestamptz not null default now(),
    primary key (activity_id, shard_id)
  )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table activity_settle, activity_pass, activity_claim, activity_counter, activity`.execute(
    db,
  );
}
