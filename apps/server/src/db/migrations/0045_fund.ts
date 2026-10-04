import { sql, type Kysely } from 'kysely';

/** 小镇发展基金（240-2）：存款表；同一家店同时只能有一笔 active */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table fund_deposit (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      tier text not null,
      coin bigint not null check (coin > 0),
      medal integer not null,
      started_at timestamptz not null,
      matures_at timestamptz not null,
      status text not null default 'active' check (status in ('active', 'claimed', 'withdrawn')),
      settled_at timestamptz,
      returned bigint
    )`.execute(db);
  await sql`create unique index fund_deposit_active on fund_deposit (rest_id) where status = 'active'`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table fund_deposit`.execute(db);
}
