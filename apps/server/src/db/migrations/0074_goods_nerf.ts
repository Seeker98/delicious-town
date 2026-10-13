import { sql, type Kysely } from 'kysely';
import { dropRetiredGoods } from './0071_item_cuts';

/**
 * 道具减法第三批（用户 2026-10-13）：
 * - 2023、2025 纪念牌匾和马到成功删掉（连同牌匾 ×2、荣誉 ×1.5、荣誉银币 +16% 的收集加成），财神降临删掉；
 *   仙贝（红、黄、蓝）、真爱勋章、中国结、四叶草、锦鲤下架。持有的、加成来源都清掉，加成缓存标脏
 * - 一批荣誉削弱：已经生效的加成来源直接改成新效果（加成来源里存的是发放当时的效果），加成缓存标脏
 * - 区服覆盖和历史版本里的 tuning.collection.an2023Multiplier / mdcgMultiplier / an2025CoinBonus 删掉
 *   （同 0053、0061、0071~0073）
 * down 什么也不做：删掉的设置和道具、改掉的效果回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await stripCollectionOverrides(db);
  await dropRetiredGoods(db, RETIRED_GOODS);
  await applyNerfs(db);
}

/** 这次退役的道具：三块纪念牌匾、财神降临、仙贝红黄蓝、真爱勋章、中国结、四叶草、锦鲤 */
export const RETIRED_GOODS = [10905, 10906, 10907, 30508, 30522, 30523, 60102, 60301, 60302, 60303, 61404];

/** 削弱后的效果（和 master/goods.json 的 value 一致，迁移里写死当时的值） */
export const NERFED: Record<number, Record<string, number>> = {
  60305: { expRate: 0.02, luckValue: 8 }, // 鞭炮
  60306: { expRate: 0.01, luckValue: 6 }, // 灯笼
  60307: { expRate: 0.01, luckValue: 4 }, // 福
  60901: { coinRate: 0.03, expRate: 0.03 }, // 厨神
  60902: { coinRate: 0.02, expRate: 0.02 }, // 厨圣
  60903: { coinRate: 0.01, expRate: 0.01 }, // 厨王
  61001: { luckValue: 10, coinRate: 0.02, expRate: 0.03 }, // 痛心入骨
  61002: { luckValue: 5, expRate: 0.01, godHand: 1 }, // 神之一手
  61411: { expRate: 0.01, getStrengthRate: 0.3 }, // 点赞王
  61503: { expRate: 0.02 }, // 众口交赞
  61505: { taExpRate: 0.1 }, // 外卖之星
};

/** 已经生效的加成来源改成新效果；restIds 只给测试用 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyNerfs(db: Kysely<any>, restIds?: number[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const only = (col: any) => (restIds ? sql`${col} in (${sql.join(restIds)})` : sql`true`);
  for (const [id, effects] of Object.entries(NERFED)) {
    const rows = await sql<{ rest_id: number }>`
      update effect_source set effects = ${JSON.stringify(effects)}::jsonb
       where source_type = 'honor' and source_id = ${Number(id)} and ${only(sql.ref('rest_id'))}
      returning rest_id`.execute(db);
    const rests = rows.rows.map((r) => r.rest_id);
    if (rests.length > 0)
      await sql`update restaurant set effect_dirty = true where id in (${sql.join(rests)})`.execute(db);
  }
}

/** 区服覆盖和历史版本里删掉三块纪念牌匾的收集加成设置 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stripCollectionOverrides(db: Kysely<any>): Promise<void> {
  for (const table of ['shard_config', 'shard_config_history']) {
    await sql`
      update ${sql.table(table)}
      set override = override #- '{tuning,collection,an2023Multiplier}' #- '{tuning,collection,mdcgMultiplier}'
        #- '{tuning,collection,an2025CoinBonus}'
      where override #> '{tuning,collection}' ?| array['an2023Multiplier', 'mdcgMultiplier', 'an2025CoinBonus']`.execute(
      db,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
