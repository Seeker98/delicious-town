import type { Kysely } from 'kysely';
import { EQUIP_ATTRS, GOODS_TYPE, type EquipAttr, type EquipAttrs, type GameConfig } from '@dt/config';
import { hashSeed, seededRng, type Rng } from '@dt/shared';
import type { DB, EquipGemRow, EquipRow } from '../../db/schema';
import { withRestaurant } from '../../db/tx';
import { addAttrs, rollEquipAttrs, zeroAttrs } from './rules';

type Prefix = 'base_' | 'st_';

export function attrCols<P extends Prefix>(prefix: P, a: EquipAttrs): Record<`${P}${EquipAttr}`, number> {
  return Object.fromEntries(EQUIP_ATTRS.map((k) => [`${prefix}${k}`, a[k]])) as Record<
    `${P}${EquipAttr}`,
    number
  >;
}

function readCols(e: EquipRow, prefix: Prefix): EquipAttrs {
  const out = zeroAttrs();
  for (const k of EQUIP_ATTRS) out[k] = e[`${prefix}${k}`];
  return out;
}

export const baseAttrs = (e: EquipRow): EquipAttrs => readCols(e, 'base_');
export const boostAttrs = (e: EquipRow): EquipAttrs => readCols(e, 'st_');

export function gemAttrs(gems: readonly EquipGemRow[]): EquipAttrs {
  const out = zeroAttrs();
  for (const g of gems) for (const k of EQUIP_ATTRS) out[k] += g[k];
  return out;
}

/** 单件属性 = 基础 + 强化增量 + 宝石 */
export function pieceTotal(e: EquipRow, gems: readonly EquipGemRow[]): EquipAttrs {
  return addAttrs(addAttrs(baseAttrs(e), boostAttrs(e)), gemAttrs(gems));
}

/** 生成 num 件厨具实例（规格书 07 §7.7） */
export async function createEquips(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  goodsId: number,
  num: number,
  now: Date,
  rng: Rng,
): Promise<number[]> {
  const def = config.requireGoods(goodsId).equip;
  if (!def) throw new Error(`goods ${goodsId} is not equip`);
  const ids: number[] = [];
  for (let i = 0; i < num; i++) {
    const row = await db
      .insertInto('equip')
      .values({
        rest_id: restId,
        goods_id: goodsId,
        part: def.part,
        suit_id: def.suitId,
        min_level: def.minLevel,
        cur_hole: def.hole,
        max_hole: def.maxHole,
        acquired_at: now,
        ...attrCols('base_', rollEquipAttrs(def, rng)),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    ids.push(row.id);
  }
  return ids;
}

export async function loadGems(db: Kysely<DB>, equipIds: number[]): Promise<Map<number, EquipGemRow[]>> {
  const out = new Map<number, EquipGemRow[]>();
  if (equipIds.length === 0) return out;
  const rows = await db
    .selectFrom('equip_gem')
    .selectAll()
    .where('equip_id', 'in', equipIds)
    .orderBy('id')
    .execute();
  for (const r of rows) out.set(r.equip_id, [...(out.get(r.equip_id) ?? []), r]);
  return out;
}

/** 旧版把厨具当普通道具存在 store_item 里：按数量转成实例（计划裁定 2），幂等 */
export async function convertLegacyEquips(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
): Promise<number> {
  const ids = config.bundle.goods.filter((g) => g.type === GOODS_TYPE.equip).map((g) => g.id);
  const rows = await db
    .selectFrom('store_item as s')
    .innerJoin('restaurant as r', 'r.id', 's.rest_id')
    .select(['s.rest_id', 's.goods_id'])
    .where('r.shard_id', '=', shardId)
    .where('s.goods_id', 'in', ids)
    .execute();
  const byRest = new Map<number, number[]>();
  for (const r of rows) byRest.set(r.rest_id, [...(byRest.get(r.rest_id) ?? []), r.goods_id]);
  let made = 0;
  for (const [restId, goodsIds] of byRest) {
    made += await withRestaurant(db, restId, async (tx) => {
      let n = 0;
      for (const goodsId of goodsIds) {
        const del = await tx
          .deleteFrom('store_item')
          .where('rest_id', '=', restId)
          .where('goods_id', '=', goodsId)
          .returning('num')
          .executeTakeFirst();
        if (!del || del.num <= 0) continue;
        const rng = seededRng(hashSeed(restId, goodsId, 'legacy-equip'));
        await createEquips(tx, config, restId, goodsId, del.num, new Date(), rng);
        n += del.num;
      }
      return n;
    });
  }
  return made;
}
