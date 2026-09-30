import { sql, type Kysely } from 'kysely';

const ATTRS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'];
const cols = (prefix: string) =>
  ATTRS.map((a) => `${prefix}${a} integer not null default 0`).join(',\n      ');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table equip (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      goods_id integer not null,
      part smallint not null,
      suit_id integer not null default 0,
      min_level integer not null default 0,
      cur_hole smallint not null default 0,
      max_hole smallint not null default 0,
      stress smallint not null default 0,
      fail_streak integer not null default 0,
      locked boolean not null default false,
      worn boolean not null default false,
      ${sql.raw(cols('base_'))},
      ${sql.raw(cols('st_'))},
      acquired_at timestamptz not null default now()
    )`,
    sql`create index equip_rest on equip (rest_id)`,
    sql`create unique index equip_worn_part on equip (rest_id, part) where worn`,
    sql`create table equip_gem (
      id integer generated always as identity primary key,
      equip_id integer not null references equip(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      gem_goods_id integer not null,
      level smallint not null,
      ${sql.raw(ATTRS.map((a) => `${a} integer not null default 0`).join(',\n      '))},
      created_at timestamptz not null default now()
    )`,
    sql`create index equip_gem_equip on equip_gem (equip_id)`,
    sql`create table equip_stress_log (
      id integer generated always as identity primary key,
      equip_id integer not null references equip(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      stress smallint not null,
      success boolean not null,
      attr text,
      val integer not null default 0,
      lucky boolean not null default false,
      floor boolean not null default false,
      stone boolean not null default false,
      created_at timestamptz not null default now()
    )`,
    sql`create index equip_stress_log_equip on equip_stress_log (equip_id, id)`,
    sql`create table equip_preset (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      name text not null,
      part1 integer references equip(id) on delete set null,
      part2 integer references equip(id) on delete set null,
      part3 integer references equip(id) on delete set null,
      part4 integer references equip(id) on delete set null,
      part5 integer references equip(id) on delete set null,
      created_at timestamptz not null default now(),
      unique (rest_id, name)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['equip_preset', 'equip_stress_log', 'equip_gem', 'equip']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
