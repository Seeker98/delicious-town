import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table yard_land (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      no smallint not null,
      level smallint not null default 1,
      exp integer not null default 0,
      created_at timestamptz not null default now(),
      unique (rest_id, no)
    )`,
    sql`create table yard_plant (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      land_id integer not null unique references yard_land(id) on delete cascade,
      seed_id integer not null,
      foods_id integer not null,
      stage smallint not null check (stage between 1 and 5),
      stage_at timestamptz not null,
      feed_min integer not null default 0,
      infancy integer not null,
      maturity integer not null,
      autumn integer not null,
      harvest integer not null,
      harvest_num integer not null check (harvest_num >= 0),
      harvest_max integer not null,
      worm smallint not null default 0,
      grass smallint not null default 0,
      dry smallint not null default 0,
      planted_at timestamptz not null default now()
    )`,
    sql`create index yard_plant_rest on yard_plant (rest_id)`,
    sql`create index yard_plant_shard_stage on yard_plant (shard_id, stage)`,
    sql`create table yard_steal (
      plant_id integer not null references yard_plant(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (plant_id, rest_id)
    )`,
    sql`create table yard_basket (
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, foods_id)
    )`,
    sql`create table rest_formula (
      rest_id integer not null references restaurant(id) on delete cascade,
      formula_id integer not null,
      main_num integer not null default 0 check (main_num >= 0),
      sub_num integer not null default 0 check (sub_num >= 0),
      learned boolean not null default false,
      primary key (rest_id, formula_id)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['rest_formula', 'yard_basket', 'yard_steal', 'yard_plant', 'yard_land']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
