import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table rest_mc (
      rest_id integer not null references restaurant(id) on delete cascade,
      mc_id integer not null,
      curlevel smallint not null default 1,
      curexp integer not null default 0,
      trial_worth integer not null default 0,
      trial_exp integer not null default 0,
      way smallint not null,
      master_rest_id integer,
      learned_at timestamptz not null default now(),
      primary key (rest_id, mc_id)
    )`,
    sql`create table mc_remnant (
      rest_id integer not null references restaurant(id) on delete cascade,
      mc_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, mc_id)
    )`,
    sql`create table mc_cook (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      mc_id integer not null,
      level smallint not null,
      grade smallint not null,
      cook_num integer not null,
      total_num integer not null,
      left_num integer not null check (left_num >= 0),
      price integer not null,
      luck boolean not null default false,
      eat_count integer not null default 0,
      created_at timestamptz not null default now(),
      ended_at timestamptz,
      end_reason text
    )`,
    sql`create index mc_cook_shard_time on mc_cook (shard_id, created_at)`,
    sql`create index mc_cook_rest on mc_cook (rest_id)`,
    sql`alter table restaurant add column mc_cook_id integer references mc_cook(id) on delete set null`,
    sql`create table mc_eat (
      cook_id integer not null references mc_cook(id) on delete cascade,
      eater_rest_id integer not null references restaurant(id) on delete cascade,
      eaten_at timestamptz not null default now(),
      primary key (cook_id, eater_rest_id)
    )`,
    sql`create index mc_eat_eater_time on mc_eat (eater_rest_id, eaten_at)`,
    sql`create table mc_lesson (
      id integer generated always as identity primary key,
      shard_id integer not null,
      teacher_rest_id integer not null references restaurant(id) on delete cascade,
      mc_id integer not null,
      level smallint not null,
      max_num integer not null,
      ends_at timestamptz not null,
      learned integer not null default 0,
      stolen integer not null default 0,
      closed_at timestamptz,
      created_at timestamptz not null default now()
    )`,
    sql`create unique index mc_lesson_one_open on mc_lesson (teacher_rest_id) where closed_at is null`,
    sql`create index mc_lesson_shard_ends on mc_lesson (shard_id, ends_at)`,
    sql`create table mc_lesson_student (
      lesson_id integer not null references mc_lesson(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      type smallint not null,
      success boolean not null,
      created_at timestamptz not null default now(),
      primary key (lesson_id, rest_id)
    )`,
    sql`create index mc_lesson_student_rest on mc_lesson_student (rest_id)`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant drop column if exists mc_cook_id`.execute(db);
  for (const t of ['mc_lesson_student', 'mc_lesson', 'mc_eat', 'mc_cook', 'mc_remnant', 'rest_mc']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
