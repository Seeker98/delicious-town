import { sql, type Kysely } from 'kysely';

const EMPTY_COUNTS = '{"learned":0,"grade":[0,0,0,0,0,0,0,0,0,0,0],"street":{}}';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`alter table restaurant
      add column promo_on boolean not null default false,
      add column cte_on boolean not null default false,
      add column cookfoods_flag smallint not null default 0,
      add column plaque2_open boolean not null default false,
      add column main_task_step integer not null default 1,
      add column state_reason text`,
    sql`update restaurant set cookbook_counts = ${EMPTY_COUNTS}::jsonb where cookbook_counts = '{}'::jsonb`,
    sql`alter table restaurant alter column cookbook_counts set default ${sql.lit(EMPTY_COUNTS)}::jsonb`,
    sql`create index restaurant_shard_state on restaurant (shard_id, state, id)`,
    sql`create table cupboard_food (
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_id integer not null,
      num integer not null default 0 check (num >= 0),
      fridge_num integer not null default 0 check (fridge_num >= 0),
      locked boolean not null default false,
      fridge_unread boolean not null default false,
      primary key (rest_id, foods_id)
    )`,
    sql`create table restaurant_device (
      rest_id integer not null references restaurant(id) on delete cascade,
      slot smallint not null,
      goods_id integer not null,
      placed_at timestamptz not null,
      expires_at timestamptz,
      primary key (rest_id, slot)
    )`,
    sql`create table world_state (
      shard_id integer primary key references shard(id),
      weather_id integer not null,
      weather_until timestamptz not null,
      krab_street integer not null,
      plankton_rest_id integer,
      updated_at timestamptz not null default now()
    )`,
    sql`create table market_item (
      id bigint generated always as identity primary key,
      shard_id integer not null references shard(id),
      shelf smallint not null check (shelf in (0, 1, 2)),
      period text not null,
      foods_id integer not null,
      stock integer not null,
      sold integer not null default 0,
      hot boolean not null default false,
      opened_at timestamptz not null,
      check (sold >= 0 and sold <= stock)
    )`,
    sql`create index market_item_shard_shelf on market_item (shard_id, shelf)`,
    sql`create table market_buy (
      market_item_id bigint not null references market_item(id) on delete cascade,
      subject text not null,
      num integer not null,
      primary key (market_item_id, subject)
    )`,
    sql`create table market_guess (
      shard_id integer not null references shard(id),
      period text not null,
      rest_id integer not null references restaurant(id) on delete cascade,
      foods_ids integer[] not null,
      hits integer,
      settled_at timestamptz,
      created_at timestamptz not null,
      primary key (shard_id, period, rest_id)
    )`,
    sql`create table shop_special (
      shard_id integer not null references shard(id),
      day date not null,
      goods_id integer not null,
      discount double precision not null,
      tier_name text not null,
      stock integer not null,
      sold integer not null default 0,
      check (sold >= 0 and sold <= stock),
      primary key (shard_id, day)
    )`,
    sql`create table event_counter (
      rest_id integer not null references restaurant(id) on delete cascade,
      key text not null,
      count bigint not null default 0,
      primary key (rest_id, key)
    )`,
    sql`create table task_done (
      rest_id integer not null references restaurant(id) on delete cascade,
      task_id integer not null,
      done_at timestamptz not null,
      primary key (rest_id, task_id)
    )`,
    sql`create table income_round (
      id bigint generated always as identity,
      rest_id integer not null,
      round_no bigint not null,
      coin bigint not null,
      exp bigint not null,
      oil integer not null,
      customers jsonb not null,
      rates jsonb not null,
      drops jsonb not null,
      created_at timestamptz not null,
      primary key (id, created_at)
    ) partition by range (created_at)`,
    sql`create index income_round_rest_time on income_round (rest_id, created_at desc)`,
    sql`create table income_round_default partition of income_round default`,
    sql`create table rest_log (
      id bigint generated always as identity,
      rest_id integer not null,
      type text not null,
      params jsonb not null default '{}',
      created_at timestamptz not null,
      primary key (id, created_at)
    ) partition by range (created_at)`,
    sql`create index rest_log_rest_time on rest_log (rest_id, created_at desc)`,
    sql`create table rest_log_default partition of rest_log default`,
    sql`create table job_run (
      shard_id integer not null,
      job text not null,
      period text not null,
      started_at timestamptz not null,
      finished_at timestamptz,
      stats jsonb not null default '{}',
      primary key (shard_id, job, period)
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of [
    'job_run',
    'rest_log',
    'income_round',
    'task_done',
    'event_counter',
    'shop_special',
    'market_guess',
    'market_buy',
    'market_item',
    'world_state',
    'restaurant_device',
    'cupboard_food',
  ]) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
  await sql`drop index if exists restaurant_shard_state`.execute(db);
  await sql`alter table restaurant
    drop column promo_on, drop column cte_on, drop column cookfoods_flag,
    drop column plaque2_open, drop column main_task_step, drop column state_reason`.execute(db);
}
