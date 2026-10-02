import { sql, type Kysely } from 'kysely';

/** 一番赏：奖池和签 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table kuji_pool (
      id bigserial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      day text not null,
      seq integer not null,
      status text not null check (status in ('open', 'sold_out', 'expired')),
      total integer not null,
      last_rest_id integer references restaurant(id) on delete set null,
      created_at timestamptz not null,
      closed_at timestamptz,
      unique (shard_id, day, seq)
    )`.execute(db);
  await sql`create index kuji_pool_open on kuji_pool (shard_id, status)`.execute(db);
  await sql`
    create table kuji_ticket (
      pool_id bigint not null references kuji_pool(id) on delete cascade,
      idx integer not null,
      tier text not null,
      drawn_by integer references restaurant(id) on delete set null,
      drawn_at timestamptz,
      primary key (pool_id, idx)
    )`.execute(db);
  await sql`create index kuji_ticket_left on kuji_ticket (pool_id) where drawn_at is null`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table kuji_ticket`.execute(db);
  await sql`drop table kuji_pool`.execute(db);
}
