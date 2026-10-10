import { sql, type Kysely } from 'kysely';

/** 特许大宗认购（大宗认购设计 §3.1）：认购食材清单（全服一份，从期货清单复制）、批次、出价 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table bulk_food (
      foods_id integer primary key,
      enabled boolean not null default true,
      updated_at timestamptz not null default now(),
      updated_by integer
    )`.execute(db);
  await sql`insert into bulk_food (foods_id, enabled) select foods_id, true from futures_food where enabled`.execute(
    db,
  );
  await sql`
    create table bulk_lot (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      day date not null,
      foods_id integer not null,
      level integer not null,
      qty integer not null check (qty > 0),
      reserve bigint not null check (reserve > 0),
      cap integer not null check (cap > 0),
      group_qty integer not null check (group_qty > 0),
      opens_at timestamptz not null,
      ends_at timestamptz not null,
      close_at timestamptz not null,
      status text not null default 'open' check (status in ('open', 'settled', 'failed', 'cancelled')),
      price bigint,
      sold integer,
      settled_at timestamptz,
      unique (shard_id, day)
    )`.execute(db);
  await sql`create index bulk_lot_open on bulk_lot (close_at) where status = 'open'`.execute(db);
  await sql`create index bulk_lot_recent on bulk_lot (shard_id, opens_at desc)`.execute(db);
  await sql`
    create table bulk_bid (
      lot_id bigint not null references bulk_lot(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      price bigint not null check (price > 0),
      qty integer not null check (qty > 0),
      frozen bigint not null,
      ranked_at timestamptz not null,
      last_bid_at timestamptz not null,
      won integer,
      paid bigint,
      refunded bigint,
      consolation boolean not null default false,
      settled_at timestamptz,
      primary key (lot_id, rest_id)
    )`.execute(db);
  await sql`create index bulk_bid_unsettled on bulk_bid (lot_id) where settled_at is null`.execute(db);
  await sql`create index bulk_bid_rest on bulk_bid (rest_id, lot_id desc)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table bulk_bid`.execute(db);
  await sql`drop table bulk_lot`.execute(db);
  await sql`drop table bulk_food`.execute(db);
}
