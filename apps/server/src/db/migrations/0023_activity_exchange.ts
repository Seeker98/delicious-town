import { sql, type Kysely } from 'kysely';

/** 148-2：活动类型加上兑换活动 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass', 'boost', 'exchange'))`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from activity where kind = 'exchange'`.execute(db);
  await sql`alter table activity drop constraint activity_kind_check`.execute(db);
  await sql`alter table activity add constraint activity_kind_check check (kind in ('goals', 'grid', 'pass', 'boost'))`.execute(
    db,
  );
}
