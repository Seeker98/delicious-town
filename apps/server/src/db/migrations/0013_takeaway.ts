import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table takeaway_state (
      rest_id integer primary key references restaurant(id) on delete cascade,
      rider_cap smallint not null default 1 check (rider_cap >= 1),
      opened_at timestamptz not null
    )`,
    sql`create table takeaway_rider (
      id serial primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      rider_rest_id integer not null references restaurant(id) on delete cascade,
      level smallint not null default 1 check (level between 1 and 50),
      exp integer not null default 0 check (exp >= 0),
      hired_at timestamptz not null,
      unique (rest_id, rider_rest_id)
    )`,
    sql`create unique index takeaway_rider_one_employer on takeaway_rider (rider_rest_id) where rider_rest_id <> rest_id`,
    sql`create table takeaway_order (
      id serial primary key,
      shard_id integer not null references shard(id) on delete cascade,
      owner_rest_id integer references restaurant(id) on delete cascade,
      cookbook_id integer not null,
      grade smallint not null check (grade between 1 and 7),
      need_minutes integer not null check (need_minutes >= 1),
      need_renown integer not null check (need_renown >= 0),
      state smallint not null default 1 check (state in (1, 2, 3)),
      created_at timestamptz not null,
      expires_at timestamptz not null
    )`,
    sql`create index takeaway_order_open on takeaway_order (shard_id, state, expires_at)`,
    sql`create table takeaway_delivery (
      id serial primary key,
      order_id integer not null unique references takeaway_order(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      rider_id integer not null references takeaway_rider(id) on delete cascade,
      grade smallint not null check (grade between 1 and 7),
      private boolean not null,
      double boolean not null,
      mystery_kinds smallint not null check (mystery_kinds >= 0),
      coin integer not null check (coin >= 0),
      exp integer not null check (exp >= 0),
      renown integer not null,
      success_odds integer not null,
      started_at timestamptz not null,
      arrive_at timestamptz not null,
      state smallint not null default 1 check (state in (1, 2, 3)),
      drone boolean not null default false,
      result jsonb,
      settled_at timestamptz
    )`,
    sql`create index takeaway_delivery_rest on takeaway_delivery (rest_id, state)`,
    sql`create index takeaway_delivery_rider on takeaway_delivery (rider_id, state)`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['takeaway_delivery', 'takeaway_order', 'takeaway_rider', 'takeaway_state']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
