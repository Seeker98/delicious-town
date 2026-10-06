import { sql, type Kysely } from 'kysely';

/** 收购（问题记录 421）：每天的收入汇总、每家店的收购状态、交易记录、关联账号拦截 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // income_round 只留 3 天，身价要看 7 天：每天把前一天汇总进来
  await sql`
    create table rest_income_day (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      coin bigint not null,
      rounds integer not null,
      primary key (rest_id, day)
    )`.execute(db);
  await sql`create index rest_income_day_day on rest_income_day (day)`.execute(db);
  await sql`
    create table acquire_state (
      rest_id integer primary key references restaurant(id) on delete cascade,
      shard_id integer not null references shard(id) on delete cascade,
      owner_rest_id integer references restaurant(id) on delete set null,
      base bigint not null check (base > 0),
      heat double precision not null default 1 check (heat >= 1),
      protected_until timestamptz,
      list_rate double precision check (list_rate > 0 and list_rate <= 1),
      list_until timestamptz,
      acquired_at timestamptz,
      tended_day date
    )`.execute(db);
  await sql`create index acquire_state_owner on acquire_state (owner_rest_id) where owner_rest_id is not null`.execute(
    db,
  );
  await sql`create index acquire_state_price on acquire_state (shard_id, (base * heat) desc)`.execute(db);
  await sql`create index acquire_state_listed on acquire_state (shard_id, list_until) where list_until is not null`.execute(
    db,
  );
  await sql`
    create table acquire_log (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      kind text not null check (kind in ('acquire', 'buy_listed', 'redeem', 'release')),
      buyer_rest_id integer references restaurant(id) on delete set null,
      target_rest_id integer not null references restaurant(id) on delete cascade,
      seller_rest_id integer references restaurant(id) on delete set null,
      price bigint not null,
      tax bigint not null,
      heat_after double precision not null,
      created_at timestamptz not null
    )`.execute(db);
  await sql`create index acquire_log_target on acquire_log (target_rest_id, created_at desc)`.execute(db);
  await sql`create index acquire_log_buyer on acquire_log (buyer_rest_id, created_at desc)`.execute(db);
  await sql`
    create table acquire_block (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      buyer_rest_id integer not null references restaurant(id) on delete cascade,
      target_rest_id integer not null references restaurant(id) on delete cascade,
      reason text not null check (reason in ('device', 'ip')),
      created_at timestamptz not null
    )`.execute(db);
  await sql`create index acquire_block_shard on acquire_block (shard_id, created_at desc)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table acquire_block`.execute(db);
  await sql`drop table acquire_log`.execute(db);
  await sql`drop table acquire_state`.execute(db);
  await sql`drop table rest_income_day`.execute(db);
}
