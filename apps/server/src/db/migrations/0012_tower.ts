import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table tower_state (
      rest_id integer primary key references restaurant(id) on delete cascade,
      best_floor smallint not null default 0 check (best_floor between 0 and 10)
    )`,
    sql`create table tower_watchman_mc (
      shard_id integer not null references shard(id) on delete cascade,
      floor smallint not null check (floor between 1 and 10),
      mc_id integer not null,
      price integer not null check (price >= 0),
      day date not null,
      primary key (shard_id, floor)
    )`,
    sql`create table tower_rank (
      shard_id integer not null references shard(id) on delete cascade,
      week date not null,
      rank smallint not null check (rank between 1 and 15),
      rest_id integer not null references restaurant(id) on delete cascade,
      primary key (shard_id, week, rank),
      unique (shard_id, week, rest_id)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['tower_rank', 'tower_watchman_mc', 'tower_state']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
