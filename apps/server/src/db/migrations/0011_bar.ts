import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table bar_state (
      rest_id integer primary key references restaurant(id) on delete cascade,
      fg_result smallint check (fg_result between -1 and 1),
      fg_times integer not null default 0 check (fg_times >= 0),
      cup_result smallint check (cup_result between -1 and 1),
      cup_times integer not null default 0 check (cup_times >= 0),
      num_result smallint check (num_result between -1 and 1),
      num_times integer not null default 0 check (num_times >= 0),
      slot_fail integer not null default 0 check (slot_fail >= 0)
    )`,
    sql`create table bar_slot_stat (
      rest_id integer not null references restaurant(id) on delete cascade,
      award_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, award_id)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['bar_slot_stat', 'bar_state']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
