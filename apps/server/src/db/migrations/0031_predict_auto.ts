import { sql, type Kysely } from 'kysely';

/** 238-2：系统自动出题的唯一键、判定依据、最早判定时间 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table predict_event
    add column auto_key text,
    add column result_note text,
    add column resolve_at timestamptz`.execute(db);
  await sql`create unique index predict_event_auto on predict_event (shard_id, auto_key)`.execute(db);
  await sql`create index predict_event_resolve on predict_event (shard_id, resolve_at) where auto_key is not null and status in ('open', 'closed')`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index predict_event_resolve`.execute(db);
  await sql`drop index predict_event_auto`.execute(db);
  await sql`alter table predict_event drop column resolve_at, drop column result_note, drop column auto_key`.execute(
    db,
  );
}
