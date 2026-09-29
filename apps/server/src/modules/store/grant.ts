import { sql, type Kysely } from 'kysely';
import { goodsEffectHours, type GameConfig, type Goods } from '@dt/config';
import type { DB } from '../../db/schema';
import { upsertEffectSource } from '../effects/service';

const HONOR_TYPE = 9;
const STREET_MEDAL_BASE = 140;

/** 街道勋章：id = 140 + 街道号，devicetype = 街道号（规格书 00 §0.6） */
export function sourceTypeForGoods(g: Goods): 'street' | 'honor' {
  const isStreetMedal =
    g.type === HONOR_TYPE && g.deviceType !== null && g.id === STREET_MEDAL_BASE + g.deviceType;
  return isStreetMedal ? 'street' : 'honor';
}

/**
 * 给餐厅发道具（规格书 00 §0.9）：勋章数量恒为 1、再次获得刷新有效期，并写入加成来源；
 * 可叠加道具累加到持有上限。不可叠加的厨具实例在子项目 2 实现。
 */
export async function grantGoods(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  goodsId: number,
  num: number,
  now: Date,
): Promise<void> {
  const g = config.requireGoods(goodsId);
  const hours = goodsEffectHours(g);
  const expiresAt = hours !== null ? new Date(now.getTime() + hours * 3600_000) : null;
  const isHonor = g.type === HONOR_TYPE;
  const qty = isHonor ? 1 : Math.min(num, g.maxNum);
  await db
    .insertInto('store_item')
    .values({ rest_id: restId, goods_id: goodsId, num: qty, acquired_at: now, expires_at: expiresAt })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'goods_id']).doUpdateSet({
        num: isHonor ? 1 : sql<number>`least(store_item.num + ${qty}, ${g.maxNum})`,
        acquired_at: now,
        expires_at: expiresAt,
      }),
    )
    .execute();
  if (isHonor) {
    await upsertEffectSource(db, restId, {
      sourceType: sourceTypeForGoods(g),
      sourceId: g.id,
      effects: g.effects,
      expiresAt,
    });
  }
}
