import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table rest_trial (
      rest_id integer primary key references restaurant(id) on delete cascade,
      mc_id integer not null,
      way smallint not null,
      prepared_at timestamptz not null default now()
    )`,
    sql`create table kraken_feed (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      day text not null,
      mc_id integer not null,
      target_mc_id integer not null,
      num integer not null,
      favor integer not null,
      created_at timestamptz not null default now(),
      unique (rest_id, day)
    )`,
    sql`create index kraken_feed_shard_day on kraken_feed (shard_id, day)`,
    sql`create table tentacle_shop (
      rest_id integer not null references restaurant(id) on delete cascade,
      day text not null,
      refreshes integer not null default 0,
      slots jsonb not null,
      primary key (rest_id, day)
    )`,
    sql`create table rest_seed (
      rest_id integer not null references restaurant(id) on delete cascade,
      seed_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, seed_id)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['rest_seed', 'tentacle_shop', 'kraken_feed', 'rest_trial']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
