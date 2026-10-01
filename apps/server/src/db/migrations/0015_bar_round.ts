import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`create table bar_round (
    rest_id integer not null references restaurant(id) on delete cascade,
    game text not null,
    state jsonb not null,
    started_at timestamptz not null,
    updated_at timestamptz not null,
    primary key (rest_id, game)
  )`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists bar_round`.execute(db);
}
