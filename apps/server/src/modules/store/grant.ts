import type { Kysely } from 'kysely';
import { DEVICE_TYPE, goodsEffectHours, GOODS_TYPE, type GameConfig, type Goods } from '@dt/config';
import { hashSeed, seededRng, type Rng } from '@dt/shared';
import type { DB } from '../../db/schema';
import { createEquips } from '../equip/instances';
import { markEffectsDirty, upsertEffectSource } from '../effects/service';

/** 街道勋章：type 9 且 devicetype 是街道号（江西街起 id 不连续，不能按 140 + 街道号判断） */
export function sourceTypeForGoods(g: Goods, config: GameConfig): 'street' | 'honor' {
  return config.isStreetMedal(g) ? 'street' : 'honor';
}

export interface GrantResult {
  granted: number;
  dropped: number;
  expiresAt: Date | null;
}

/**
 * 给餐厅发道具（规格书 00 §0.9）：勋章数量恒为 1、再次获得刷新有效期并写入加成来源；
 * 其他道具累加到持有上限，超出部分丢弃。只有勋章在仓库里带有效期，设施的时长在摆放时才开始算。
 */
export async function grantGoods(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  goodsId: number,
  num: number,
  now: Date,
  opts: { hours?: number | null; rng?: Rng } = {},
): Promise<GrantResult> {
  const g = config.requireGoods(goodsId);
  if (g.type === GOODS_TYPE.equip) {
    // 厨具每件是一个实例，不进仓库表（设计文档 §4.2）；仓库满了也照发
    const rng = opts.rng ?? seededRng(hashSeed(restId, goodsId, now.getTime(), 'equip'));
    await createEquips(db, config, restId, goodsId, num, now, rng);
    return { granted: num, dropped: 0, expiresAt: null };
  }
  const isHonor = g.type === GOODS_TYPE.honor;
  const hours = isHonor ? (opts.hours !== undefined ? opts.hours : goodsEffectHours(g)) : null;
  const expiresAt = hours !== null ? new Date(now.getTime() + hours * 3600_000) : null;
  const before = await db
    .selectFrom('store_item')
    .select('num')
    .where('rest_id', '=', restId)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  const have = before?.num ?? 0;
  const target = isHonor ? 1 : Math.min(have + num, g.maxNum);
  const granted = isHonor ? 1 : target - have;
  const dropped = isHonor ? 0 : num - granted;
  await db
    .insertInto('store_item')
    .values({ rest_id: restId, goods_id: goodsId, num: target, acquired_at: now, expires_at: expiresAt })
    .onConflict((oc) =>
      oc
        .columns(['rest_id', 'goods_id'])
        .doUpdateSet({ num: target, acquired_at: now, expires_at: expiresAt }),
    )
    .execute();
  if (isHonor) {
    await upsertEffectSource(db, restId, {
      sourceType: sourceTypeForGoods(g, config),
      sourceId: g.id,
      effects: g.effects,
      expiresAt,
    });
  } else if (g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque && have === 0) {
    await markEffectsDirty(db, restId);
  }
  return { granted, dropped, expiresAt };
}
