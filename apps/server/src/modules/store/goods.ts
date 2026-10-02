import { sql, type Kysely } from 'kysely';
import { DEVICE_TYPE, GOODS_TYPE, takesStoreSlot } from '@dt/config';
import { ErrorCode } from '@dt/shared';
import { notEnough } from '../../core/errors';
import { invalidateAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { recordChange } from '../../core/resources';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { markEffectsDirty, removeEffectSource } from '../effects/service';
import { grantGoods, sourceTypeForGoods } from './grant';

export interface GoodsGrantOptions {
  source?: string;
  /** 勋章有效期（小时）；不传用道具自己的时长 */
  hours?: number | null;
  lucky?: boolean;
  event?: boolean;
}

function affectsAgg(op: Op, goodsId: number): boolean {
  const g = op.config.requireGoods(goodsId);
  return g.type === GOODS_TYPE.honor || (g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque);
}

export async function grantGoodsOp(
  op: Op,
  goodsId: number,
  num: number,
  opts: GoodsGrantOptions = {},
): Promise<number> {
  if (num <= 0) return 0;
  const r = await grantGoods(op.tx, op.config, op.rest.id, goodsId, num, op.now, {
    hours: opts.hours,
    rng: op.rng,
  });
  if (affectsAgg(op, goodsId)) invalidateAgg(op);
  recordChange(
    op,
    'goods',
    r.granted,
    { source: opts.source, lucky: opts.lucky, event: opts.event },
    goodsId,
  );
  if (r.dropped > 0) restLog(op, 'goods.drop', { goodsId, num: r.dropped });
  return r.granted;
}

/** 持有数量；已过期的勋章算 0 */
export async function countGoods(op: Op, goodsId: number): Promise<number> {
  const r = await op.tx
    .selectFrom('store_item')
    .select(['num', 'expires_at'])
    .where('rest_id', '=', op.rest.id)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  if (!r) return 0;
  if (r.expires_at !== null && r.expires_at <= op.now) return 0;
  return r.num;
}

export async function hasValidHonor(op: Op, goodsId: number): Promise<boolean> {
  return (await countGoods(op, goodsId)) > 0;
}

export async function consumeGoods(
  op: Op,
  goodsId: number,
  num: number,
  opts: { source?: string } = {},
): Promise<void> {
  if (num <= 0) return;
  const row = await op.tx
    .updateTable('store_item')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', op.rest.id)
    .where('goods_id', '=', goodsId)
    .where('num', '>=', num)
    .returning('num')
    .executeTakeFirst();
  if (!row) throw notEnough('goods', num, await countGoods(op, goodsId), goodsId);
  if (row.num === 0) {
    await op.tx
      .deleteFrom('store_item')
      .where('rest_id', '=', op.rest.id)
      .where('goods_id', '=', goodsId)
      .execute();
    if (affectsAgg(op, goodsId)) {
      await markEffectsDirty(op.tx, op.rest.id);
      invalidateAgg(op);
    }
  }
  recordChange(op, 'goods', -num, { source: opts.source }, goodsId);
}

/** 移除勋章：删仓库记录和加成来源；返回原来是否持有 */
export async function removeHonor(op: Op, goodsId: number): Promise<boolean> {
  const g = op.config.requireGoods(goodsId);
  const del = await op.tx
    .deleteFrom('store_item')
    .where('rest_id', '=', op.rest.id)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  await removeEffectSource(op.tx, op.rest.id, sourceTypeForGoods(g, op.config), goodsId);
  invalidateAgg(op);
  return Number(del.numDeletedRows) > 0;
}

/** 仓库占用 = 持有的不同占格道具种数（勋章、纪念品不占格） + 未穿戴的厨具件数（2A 裁定 6，2B 裁定 7） */
export async function storeKinds(op: Op): Promise<number> {
  const rows = await op.tx
    .selectFrom('store_item')
    .select('goods_id')
    .where('rest_id', '=', op.rest.id)
    .where('num', '>', 0)
    .execute();
  const kinds = rows.filter((r) => takesStoreSlot(op.config.goods.get(r.goods_id))).length;
  return kinds + (await looseEquipCount(op.tx, op.rest.id));
}

/** 未穿戴的厨具件数 */
export async function looseEquipCount(db: Kysely<DB>, restId: number): Promise<number> {
  const r = await db
    .selectFrom('equip')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('rest_id', '=', restId)
    .where('worn', '=', false)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 购买新种类的道具前检查仓库容量；奖励类发放不调用它 */
export async function assertStoreRoom(op: Op, goodsId: number): Promise<void> {
  const g = op.config.requireGoods(goodsId);
  if (!takesStoreSlot(g)) return;
  if (g.type !== GOODS_TYPE.equip && (await countGoods(op, goodsId)) > 0) return;
  if ((await storeKinds(op)) >= op.rest.store_num)
    throw new AppError(ErrorCode.STORE_FULL, 400, { storeNum: op.rest.store_num });
}
