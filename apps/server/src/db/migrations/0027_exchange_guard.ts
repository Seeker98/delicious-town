import { sql, type Kysely } from 'kysely';

/** 156-2：成交记录加账号和可疑标记；冷静期的冻结记录；冻结交易所的店 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table exchange_trade
    add column buyer_account_id integer,
    add column seller_account_id integer,
    add column flags text[] not null default '{}'`.execute(db);
  await sql`create index exchange_trade_pair on exchange_trade (buyer_account_id, seller_account_id, created_at)`.execute(
    db,
  );
  await sql`create index exchange_trade_flagged on exchange_trade (shard_id, created_at) where flags <> '{}'`.execute(
    db,
  );
  await sql`
    create table exchange_hold (
      id bigserial primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      trade_id bigint references exchange_trade(id) on delete set null,
      coin bigint not null default 0,
      foods_id integer,
      num integer not null default 0,
      release_at timestamptz not null,
      status text not null check (status in ('held', 'released', 'confiscated')),
      created_at timestamptz not null default now()
    )`.execute(db);
  await sql`create index exchange_hold_rest on exchange_hold (rest_id, status, release_at)`.execute(db);
  await sql`create index exchange_hold_trade on exchange_hold (trade_id)`.execute(db);
  await sql`
    create table exchange_freeze (
      rest_id integer primary key references restaurant(id) on delete cascade,
      reason text not null,
      actor_account_id integer,
      created_at timestamptz not null default now()
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table exchange_freeze`.execute(db);
  await sql`drop table exchange_hold`.execute(db);
  await sql`drop index exchange_trade_flagged`.execute(db);
  await sql`drop index exchange_trade_pair`.execute(db);
  await sql`alter table exchange_trade drop column flags, drop column seller_account_id, drop column buyer_account_id`.execute(
    db,
  );
}
