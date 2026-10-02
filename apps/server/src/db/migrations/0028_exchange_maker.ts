import { sql, type Kysely } from 'kysely';

/** 156-3：系统做市。成交记录的系统一方店为空、加 system 标记；系统库存；系统每日收购 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table exchange_trade
    alter column buyer_rest_id drop not null,
    alter column seller_rest_id drop not null,
    add column system boolean not null default false`.execute(db);
  await sql`create index exchange_trade_system on exchange_trade (shard_id, created_at) where system`.execute(
    db,
  );
  await sql`
    create table exchange_stock (
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      num integer not null default 0 check (num >= 0),
      primary key (shard_id, foods_id)
    )`.execute(db);
  await sql`
    create table exchange_maker_day (
      shard_id integer not null references shard(id) on delete cascade,
      foods_id integer not null,
      day date not null,
      bought integer not null default 0,
      primary key (shard_id, foods_id, day)
    )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table exchange_maker_day`.execute(db);
  await sql`drop table exchange_stock`.execute(db);
  await sql`drop index exchange_trade_system`.execute(db);
  await sql`delete from exchange_trade where system`.execute(db);
  await sql`alter table exchange_trade
    drop column system,
    alter column buyer_rest_id set not null,
    alter column seller_rest_id set not null`.execute(db);
}
