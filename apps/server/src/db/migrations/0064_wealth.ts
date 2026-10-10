import { sql, type Kysely } from 'kysely';

/** 食材理财（理财设计 §3.2）：存款表；一家店可以同时有几笔 active，笔数和合计上限在服务里锁店检查 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table wealth_deposit (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      coin bigint not null check (coin > 0),
      days integer not null check (days > 0),
      goods_id integer not null,
      packs integer not null check (packs > 0),
      started_at timestamptz not null,
      matures_at timestamptz not null,
      status text not null default 'active' check (status in ('active', 'claimed', 'withdrawn')),
      settled_at timestamptz,
      returned bigint
    )`.execute(db);
  await sql`create index wealth_deposit_active on wealth_deposit (rest_id, matures_at) where status = 'active'`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table wealth_deposit`.execute(db);
}
