import { sql, type Kysely } from 'kysely';

/**
 * 天气改版 PR③：工作证由时令周榜发，嘻哈男孩删掉，镇长问答改成猜天气（天气改版设计 §4、§5）
 * - shiling_week：每家店每周获得的时令值（周榜、上周榜、周日结算都读它；rest_shiling 只留本周，跨周就清了）。
 *   last_at 是最后一次获得的时间，同分时先到的排前。本周已有的从 rest_shiling 补进来
 * - mayor_guess：镇长猜天气，一店一天一次；at 是揭晓时间（下一次自然换天），揭晓后写 actual、right
 * - 嘻哈男孩的 hiphop_day、hiphop_tip 两张表删掉；“嘻哈文化”“镇长的针对”退役，持有的清掉
 * - 发工资的任务改名 jobcard-wage：把 hiphop-wage 已经跑过的周期抄过去，上线当周不重发
 * down 只恢复表结构，打赏记录回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table shiling_week (
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      week text not null,
      gain integer not null default 0,
      last_at timestamptz not null,
      primary key (rest_id, week)
    )`.execute(db);
  await sql`create index shiling_week_rank on shiling_week (shard_id, week, gain desc)`.execute(db);
  await sql`
    insert into shiling_week (rest_id, shard_id, week, gain, last_at)
    select rest_id, shard_id, week, week_gain, now() from rest_shiling where week_gain > 0`.execute(db);

  await sql`
    create table mayor_guess (
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      day text not null,
      type smallint not null,
      at timestamptz not null,
      actual smallint,
      "right" boolean,
      created_at timestamptz not null default now(),
      primary key (rest_id, day)
    )`.execute(db);
  await sql`create index mayor_guess_open on mayor_guess (shard_id, at) where "right" is null`.execute(db);

  await sql`drop table hiphop_tip`.execute(db);
  await sql`drop table hiphop_day`.execute(db);
  await dropRetired(db);
  await sql`
    insert into job_run (shard_id, job, period, started_at, finished_at, stats)
    select shard_id, 'jobcard-wage', period, started_at, finished_at, stats from job_run where job = 'hiphop-wage'
    on conflict do nothing`.execute(db);
}

/** 退役的“嘻哈文化”（60503）、“镇长的针对”（60505）：持有的、加成来源都清掉，加成缓存标脏。restIds 只给测试用 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dropRetired(db: Kysely<any>, restIds?: number[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const only = (col: any) => (restIds ? sql`${col} in (${sql.join(restIds)})` : sql`true`);
  await sql`
    update restaurant set effect_dirty = true
     where id in (select rest_id from effect_source where source_type = 'honor' and source_id in (60503, 60505))
       and ${only(sql.ref('id'))}`.execute(db);
  await sql`
    delete from effect_source
     where source_type = 'honor' and source_id in (60503, 60505) and ${only(sql.ref('rest_id'))}`.execute(db);
  await sql`delete from store_item where goods_id in (60503, 60505) and ${only(sql.ref('rest_id'))}`.execute(
    db,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`delete from job_run where job = 'jobcard-wage'`.execute(db);
  await sql`create table hiphop_day (
    shard_id integer not null references shard(id) on delete cascade,
    day text not null,
    place smallint not null,
    rest_id integer references restaurant(id) on delete set null,
    foods_id integer not null,
    worth integer not null,
    created_at timestamptz not null,
    primary key (shard_id, day)
  )`.execute(db);
  await sql`create table hiphop_tip (
    id serial primary key,
    shard_id integer not null references shard(id) on delete cascade,
    rest_id integer not null references restaurant(id) on delete cascade,
    kind text not null,
    num bigint not null,
    foods_id integer,
    worth bigint not null,
    krab_coin integer not null default 0,
    created_at timestamptz not null
  )`.execute(db);
  await sql`create index hiphop_tip_shard_time on hiphop_tip (shard_id, created_at)`.execute(db);
  await sql`create index hiphop_tip_rest_time on hiphop_tip (rest_id, created_at)`.execute(db);
  await sql`drop table if exists mayor_guess`.execute(db);
  await sql`drop table if exists shiling_week`.execute(db);
}
