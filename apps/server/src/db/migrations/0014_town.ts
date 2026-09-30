import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`alter table world_state add column weather_changed_at timestamptz`,
    sql`create table town_bless (
      shard_id integer not null references shard(id) on delete cascade,
      day text not null,
      bless_id smallint not null,
      rest_id integer not null references restaurant(id) on delete cascade,
      created_at timestamptz not null,
      primary key (shard_id, day)
    )`,
    sql`create table town_rest (
      rest_id integer primary key references restaurant(id) on delete cascade,
      hammer_at timestamptz,
      broadcast_at timestamptz,
      big_eater_gift boolean not null default false
    )`,
    sql`create table town_shake (
      id serial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      day text not null,
      rest_id integer not null references restaurant(id) on delete cascade,
      ip text not null default '',
      device text not null default '',
      coin integer not null check (coin >= 0),
      created_at timestamptz not null,
      unique (shard_id, day, rest_id)
    )`,
    sql`create index town_shake_ip on town_shake (shard_id, day, ip)`,
    sql`create index town_shake_device on town_shake (shard_id, day, device)`,
    sql`create table town_exchange_use (
      rest_id integer not null references restaurant(id) on delete cascade,
      exchange_id smallint not null,
      times integer not null check (times >= 0),
      primary key (rest_id, exchange_id)
    )`,
    sql`create index news_shard_id on news (shard_id, id desc)`,
    sql`create index news_shard_type on news (shard_id, type, id desc)`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index if exists news_shard_type`.execute(db);
  await sql`drop index if exists news_shard_id`.execute(db);
  for (const t of ['town_exchange_use', 'town_shake', 'town_rest', 'town_bless']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
  await sql`alter table world_state drop column if exists weather_changed_at`.execute(db);
}
