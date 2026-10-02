import { sql, type Kysely } from 'kysely';

/** 156-1：交易所的挂单、成交、参考价和交易所账户 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table exchange_order (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      side text not null check (side in ('buy', 'sell')),
      foods_id integer not null,
      price integer not null check (price > 0),
      qty integer not null check (qty between 1 and 999),
      filled integer not null default 0 check (filled >= 0 and filled <= qty),
      status text not null check (status in ('open', 'filled', 'cancelled', 'expired')),
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      closed_at timestamptz
    )`.execute(db);
  await sql`create index exchange_order_book on exchange_order (shard_id, foods_id, side, status, price, id)`.execute(
    db,
  );
  await sql`create index exchange_order_rest on exchange_order (rest_id, status)`.execute(db);
  await sql`create index exchange_order_expire on exchange_order (status, expires_at)`.execute(db);
  await sql`
    create table exchange_trade (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      price integer not null,
      qty integer not null,
      buy_order_id bigint references exchange_order(id) on delete set null,
      sell_order_id bigint references exchange_order(id) on delete set null,
      buyer_rest_id integer not null,
      seller_rest_id integer not null,
      fee bigint not null,
      created_at timestamptz not null default now()
    )`.execute(db);
  await sql`create index exchange_trade_book on exchange_trade (shard_id, foods_id, created_at)`.execute(db);
  await sql`create index exchange_trade_buyer on exchange_trade (buyer_rest_id, created_at)`.execute(db);
  await sql`create index exchange_trade_seller on exchange_trade (seller_rest_id, created_at)`.execute(db);
  await sql`
    create table exchange_ref (
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      day date not null,
      price integer not null,
      primary key (shard_id, foods_id, day)
    )`.execute(db);
  await sql`
    create table exchange_wallet (
      rest_id integer primary key references restaurant(id) on delete cascade,
      coin bigint not null default 0
    )`.execute(db);
  await sql`
    create table exchange_wallet_food (
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_id integer not null,
      num integer not null,
      primary key (rest_id, foods_id)
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table exchange_wallet_food`.execute(db);
  await sql`drop table exchange_wallet`.execute(db);
  await sql`drop table exchange_ref`.execute(db);
  await sql`drop table exchange_trade`.execute(db);
  await sql`drop table exchange_order`.execute(db);
}
