import { sql, type Kysely } from 'kysely';

/** 许愿树（许愿树设计 §3.1）：每区服每天一轮；每店每轮一条许愿 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table wish_round (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      day date not null,
      goods_id integer not null,
      num integer not null check (num > 0),
      opens_at timestamptz not null,
      ends_at timestamptz not null,
      status text not null default 'open' check (status in ('open', 'drawn', 'empty')),
      winner_rest_id integer references restaurant(id) on delete set null,
      entries integer,
      drawn_at timestamptz,
      unique (shard_id, day)
    )`.execute(db);
  await sql`create index wish_round_open on wish_round (ends_at) where status = 'open'`.execute(db);
  await sql`create index wish_round_recent on wish_round (shard_id, opens_at desc)`.execute(db);
  await sql`
    create table wish_entry (
      round_id bigint not null references wish_round(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      created_at timestamptz not null,
      won boolean not null default false,
      award jsonb,
      settled_at timestamptz,
      primary key (round_id, rest_id)
    )`.execute(db);
  await sql`create index wish_entry_unsettled on wish_entry (shard_id) where settled_at is null`.execute(db);
  await sql`create index wish_entry_rest on wish_entry (rest_id, round_id desc)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table wish_entry`.execute(db);
  await sql`drop table wish_round`.execute(db);
}
