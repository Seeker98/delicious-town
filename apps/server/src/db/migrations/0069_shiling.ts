import { sql, type Kysely } from 'kysely';

/**
 * 天气改版 PR②：时令（天气改版设计 §3）
 * - mc_cook 加 shiling（下锅那一刻当令，整批应时）、shiling_acc（顾客吃掉的份数累计的点数，带小数）、
 *   shiling_pts（这一批已经入账的整数点数）
 * - rest_shiling：时令值余额、本周获得（week 是哪一周，换周从 0 算）、1 星说明弹窗看过的时间
 * - 种子折算（§3.5）：每颗 5 时令值记入余额（不算本周获得），种子清掉；触手退役，每条折 30；
 *   克拉肯删掉，kraken_feed、tentacle_shop 两张表删掉
 * down 只恢复表结构，种子和克拉肯的记录回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    alter table mc_cook
      add column shiling boolean not null default false,
      add column shiling_acc double precision not null default 0,
      add column shiling_pts integer not null default 0`.execute(db);
  await sql`
    create table rest_shiling (
      rest_id integer primary key references restaurant(id) on delete cascade,
      shard_id integer not null,
      balance integer not null default 0 check (balance >= 0),
      week text not null default '',
      week_gain integer not null default 0,
      intro_at timestamptz
    )`.execute(db);
  await sql`create index rest_shiling_week on rest_shiling (shard_id, week, week_gain desc)`.execute(db);
  await convertLegacy(db);
  await sql`drop table kraken_feed`.execute(db);
  await sql`drop table tentacle_shop`.execute(db);
}

/**
 * 旧资源折算（§3.5）：种子每颗 5、触手每条 30 记入时令值余额（不算本周获得），然后清掉。
 * restIds 只给测试用（测试库是共用的，不能清别的测试的种子）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function convertLegacy(db: Kysely<any>, restIds?: number[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const only = (col: any) => (restIds ? sql`${col} in (${sql.join(restIds)})` : sql`true`);
  await sql`
    insert into rest_shiling (rest_id, shard_id, balance)
    select s.rest_id, r.shard_id, sum(s.num) * 5
      from rest_seed s join restaurant r on r.id = s.rest_id
     where s.num > 0 and ${only(sql.ref('s.rest_id'))}
     group by s.rest_id, r.shard_id`.execute(db);
  await sql`delete from rest_seed where ${only(sql.ref('rest_id'))}`.execute(db);
  // 还持有的触手（线上 1 条，主线奖励的）：触手原来用来指定试炼菜，按指定一次的价钱 30 折成时令值
  await sql`
    insert into rest_shiling (rest_id, shard_id, balance)
    select i.rest_id, r.shard_id, sum(i.num) * 30
      from store_item i join restaurant r on r.id = i.rest_id
     where i.goods_id = 10708 and i.num > 0 and ${only(sql.ref('i.rest_id'))}
     group by i.rest_id, r.shard_id
    on conflict (rest_id) do update set balance = rest_shiling.balance + excluded.balance`.execute(db);
  await sql`delete from store_item where goods_id = 10708 and ${only(sql.ref('rest_id'))}`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`create table kraken_feed (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      day text not null,
      mc_id integer not null,
      target_mc_id integer not null,
      num integer not null,
      favor integer not null,
      created_at timestamptz not null default now(),
      unique (rest_id, day)
    )`.execute(db);
  await sql`create index kraken_feed_shard_day on kraken_feed (shard_id, day)`.execute(db);
  await sql`create table tentacle_shop (
      rest_id integer not null references restaurant(id) on delete cascade,
      day text not null,
      refreshes integer not null default 0,
      slots jsonb not null,
      primary key (rest_id, day)
    )`.execute(db);
  await sql`drop table rest_shiling`.execute(db);
  await sql`
    alter table mc_cook
      drop column shiling,
      drop column shiling_acc,
      drop column shiling_pts`.execute(db);
}
