import { sql, type Kysely } from 'kysely';

/** 豪华一番赏（240-2）：奖池分线，现有的池都是 normal；编号按线分开 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table kuji_pool add column line text not null default 'normal'
    check (line in ('normal', 'deluxe'))`.execute(db);
  await sql`alter table kuji_pool drop constraint kuji_pool_shard_id_day_seq_key`.execute(db);
  await sql`alter table kuji_pool add constraint kuji_pool_shard_line_day_seq unique (shard_id, line, day, seq)`.execute(
    db,
  );
  await sql`drop index kuji_pool_open`.execute(db);
  await sql`create index kuji_pool_open on kuji_pool (shard_id, line, status)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from kuji_pool where line = 'deluxe'`.execute(db);
  await sql`drop index kuji_pool_open`.execute(db);
  await sql`create index kuji_pool_open on kuji_pool (shard_id, status)`.execute(db);
  await sql`alter table kuji_pool drop constraint kuji_pool_shard_line_day_seq`.execute(db);
  await sql`alter table kuji_pool add constraint kuji_pool_shard_id_day_seq_key unique (shard_id, day, seq)`.execute(
    db,
  );
  await sql`alter table kuji_pool drop column line`.execute(db);
}
