import { sql, type Kysely } from 'kysely';
import { dropRetiredGoods } from './0071_item_cuts';

/**
 * 道具减法（用户 2026-10-13）：菜园整个删掉（种菜、偷菜、菜篮、配方、肥料）
 * - 表 rest_seed（0009）、yard_land、yard_plant、yard_steal、yard_basket、rest_formula（0010）删掉
 * - 区服覆盖和历史版本里的 features.yard、tuning.yard、tuning.shiling.seedRate 删掉：运行时会被静默丢掉，
 *   后台再保存或回滚到那个版本时又会报“未知配置”（同 0053、0061、0071）
 * - 退役道具：低级肥料、高级肥料、玄奥配方、配方精华、星月密卷，持有的、加成来源都清掉
 * down 只恢复表结构，删掉的设置和道具回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  for (const t of YARD_TABLES) await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  await stripYardOverrides(db);
  await dropRetiredGoods(db, RETIRED_GOODS);
}

/** 删掉的表（按依赖顺序） */
export const YARD_TABLES = [
  'rest_formula',
  'yard_basket',
  'yard_steal',
  'yard_plant',
  'yard_land',
  'rest_seed',
];

/** 这次退役的道具：低级肥料、高级肥料、玄奥配方、配方精华、星月密卷 */
export const RETIRED_GOODS = [10901, 10902, 10903, 10904, 61425];

/** 区服覆盖和历史版本里删掉菜园的设置 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stripYardOverrides(db: Kysely<any>): Promise<void> {
  for (const table of ['shard_config', 'shard_config_history']) {
    await sql`
      update ${sql.table(table)}
      set override = override #- '{features,yard}' #- '{tuning,yard}' #- '{tuning,shiling,seedRate}'
      where override #> '{features}' ? 'yard'
         or override #> '{tuning}' ? 'yard'
         or override #> '{tuning,shiling}' ? 'seedRate'`.execute(db);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table rest_seed (
      rest_id integer not null references restaurant(id) on delete cascade,
      seed_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, seed_id)
    )`,
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
