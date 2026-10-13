import { sql, type Kysely } from 'kysely';

/**
 * 道具减法（用户 2026-10-13）：神灯（61415）和星愿、名画（61201~61214）、爱心项链（60204）、
 * 使命必达（61507）和外卖加料整个删掉
 * - town_bless（每区服每天的星愿）删掉；takeaway_delivery.double（加料）删掉
 * - 区服覆盖和历史版本里的 tuning.town.bless、tuning.friend.flip.blessedRate、
 *   tuning.settlement.painting13Rate / painting13Hours / autoRefuelThreshold（集名画）删掉：运行时会被静默丢掉，
 *   后台再保存或回滚到那个版本时又会报“未知配置”（同 0053、0061）
 * - 退役道具持有的、加成来源都清掉，加成缓存标脏（dropRetiredGoods，以后再删道具可以接着用）
 * down 只恢复 town_bless 的表结构和 takeaway_delivery.double（都填 false），删掉的设置和道具回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`drop table if exists town_bless`.execute(db);
  await sql`alter table takeaway_delivery drop column double`.execute(db);
  await stripOverrides(db);
  await dropRetiredGoods(db, RETIRED_GOODS);
}

/** 这次退役的道具：爱心项链、名画 14 幅、神灯、使命必达 */
export const RETIRED_GOODS = [
  60204, 61201, 61202, 61203, 61204, 61205, 61206, 61207, 61208, 61209, 61210, 61211, 61212, 61213, 61214,
  61415, 61507,
];

/** 区服覆盖和历史版本里删掉已经不存在的设置键 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stripOverrides(db: Kysely<any>): Promise<void> {
  for (const table of ['shard_config', 'shard_config_history']) {
    await sql`
      update ${sql.table(table)}
      set override = override #- '{tuning,town,bless}' #- '{tuning,friend,flip,blessedRate}'
        #- '{tuning,settlement,painting13Rate}' #- '{tuning,settlement,painting13Hours}'
        #- '{tuning,settlement,autoRefuelThreshold}'
      where override #> '{tuning,town}' ? 'bless'
         or override #> '{tuning,friend,flip}' ? 'blessedRate'
         or override #> '{tuning,settlement}' ?| array['painting13Rate', 'painting13Hours', 'autoRefuelThreshold']`.execute(
      db,
    );
  }
}

/**
 * 退役的道具（ids）：持有的、加成来源（honor）都清掉，有加成来源的店把加成缓存标脏（同 0070 dropRetired）。
 * restIds 只给测试用
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dropRetiredGoods(db: Kysely<any>, ids: number[], restIds?: number[]): Promise<void> {
  if (ids.length === 0) return;
  const goods = sql.join(ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const only = (col: any) => (restIds ? sql`${col} in (${sql.join(restIds)})` : sql`true`);
  await sql`
    update restaurant set effect_dirty = true
     where id in (select rest_id from effect_source where source_type = 'honor' and source_id in (${goods}))
       and ${only(sql.ref('id'))}`.execute(db);
  await sql`
    delete from effect_source
     where source_type = 'honor' and source_id in (${goods}) and ${only(sql.ref('rest_id'))}`.execute(db);
  await sql`delete from store_item where goods_id in (${goods}) and ${only(sql.ref('rest_id'))}`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table takeaway_delivery add column double boolean not null default false`.execute(db);
  await sql`create table town_bless (
    shard_id integer not null references shard(id) on delete cascade,
    day text not null,
    bless_id smallint not null,
    rest_id integer not null references restaurant(id) on delete cascade,
    created_at timestamptz not null,
    primary key (shard_id, day)
  )`.execute(db);
}
