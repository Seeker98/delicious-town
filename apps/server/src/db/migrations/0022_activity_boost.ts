import { sql, type Kysely } from 'kysely';

/** 148-4：活动类型加上全服加成 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass', 'boost'))`.execute(
    db,
  );
  await sql`create index activity_boost_window on activity (starts_at, ends_at) where kind = 'boost' and deleted_at is null`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index activity_boost_window`.execute(db);
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass'))`.execute(
    db,
  );
}
