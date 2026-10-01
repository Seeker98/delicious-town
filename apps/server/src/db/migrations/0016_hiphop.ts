import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table hiphop_day (
    shard_id integer not null references shard(id) on delete cascade,
    day text not null,
    place smallint not null,
    rest_id integer references restaurant(id) on delete set null,
    foods_id integer not null,
    worth integer not null,
    created_at timestamptz not null,
    primary key (shard_id, day)
  )`.execute(db);
  await sql`create table hiphop_tip (
    id serial primary key,
    shard_id integer not null references shard(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    kind text not null,
    num bigint not null,
    foods_id integer,
    worth bigint not null,
    krab_coin integer not null default 0,
    created_at timestamptz not null
  )`.execute(db);
  await sql`create index hiphop_tip_shard_time on hiphop_tip (shard_id, created_at)`.execute(db);
  await sql`create index hiphop_tip_rest_time on hiphop_tip (rest_id, created_at)`.execute(db);
  await sql`alter table market_item add column owner_rest_id integer references restaurant(id) on delete cascade`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table market_item drop column if exists owner_rest_id`.execute(db);
  await sql`drop table if exists hiphop_tip`.execute(db);
  await sql`drop table if exists hiphop_day`.execute(db);
}
