import { sql, type Kysely } from 'kysely';
import { dropRetiredGoods } from './0071_item_cuts';

/**
 * 道具减法第四批（用户 2026-10-13）：
 * - 欲望之针、探险者秘籍、巫毒娃娃下架：持有的、加成来源都清掉，加成缓存标脏
 * - 星级牌匾去掉每桌经验、最终经验改成 +3%~+30%：已经摆出的牌匾，加成来源里存的是摆放当时的效果
 *   （effect_source，source_type = 'device'、source_id = 槽位，见 growth/devices.ts），按槽位上摆的牌匾改成新效果，
 *   加成缓存标脏
 * - 开张大吉、星神之杯、星神眷顾是勋章，存着旧值的加成来源由 effects/resync.ts 的 honor-effects-resync
 *   （勋章数值指纹变了就跑一次）按新配置重写，这里不重复
 * down 什么也不做：下架的道具、改掉的效果回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await dropRetiredGoods(db, RETIRED_GOODS);
  await resyncPlacedDevices(db, PLAQUES);
}

/** 这次下架的道具：欲望之针、探险者秘籍、巫毒娃娃 */
export const RETIRED_GOODS = [61414, 61420, 61422];

/** 星级牌匾的新效果（和 master/goods.json 的 value 一致，迁移里写死当时的值） */
export const PLAQUES: Record<number, Record<string, number>> = {
  30502: { expRate: 0.03 }, // 一星
  30503: { expRate: 0.05 }, // 二星
  30504: { expRate: 0.08 }, // 三星
  30505: { expRate: 0.12 }, // 四星
  30506: { expRate: 0.17 }, // 五星
  30507: { expRate: 0.23 }, // 六星
  30521: { expRate: 0.3 }, // 七星
};

/**
 * 已经摆出的设施（goodsEffects 的键是道具编号）：加成来源改成给定的效果，改了的店把加成缓存标脏。
 * restIds 只给测试用
 */
export async function resyncPlacedDevices(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  goodsEffects: Record<number, Record<string, number>>,
  restIds?: number[],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const only = (col: any) => (restIds ? sql`${col} in (${sql.join(restIds)})` : sql`true`);
  const dirty = new Set<number>();
  for (const [id, effects] of Object.entries(goodsEffects)) {
    const json = JSON.stringify(effects);
    const rows = await sql<{ rest_id: number }>`
      update effect_source es set effects = ${json}::jsonb
        from restaurant_device d
       where es.source_type = 'device' and d.rest_id = es.rest_id and d.slot = es.source_id
         and d.goods_id = ${Number(id)} and es.effects is distinct from ${json}::jsonb
         and ${only(sql.ref('es.rest_id'))}
      returning es.rest_id`.execute(db);
    for (const r of rows.rows) dirty.add(r.rest_id);
  }
  if (dirty.size > 0)
    await sql`update restaurant set effect_dirty = true
               where id in (${sql.join([...dirty].sort((a, b) => a - b))})`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(_db: Kysely<any>): Promise<void> {}
