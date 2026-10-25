import { artEffectsOf, artFits, deviceHours, DEVICE_TYPE, GOODS_TYPE } from '@dt/config';
import { emitAction } from '../../core/action';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { invalidateAgg, opAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { upsertEffectSource } from '../effects/service';
import { slotUnlocked } from '../restaurant/reads';
import { consumeGoods, countGoods } from '../store/goods';
import { grantBreed } from './breed';

/** 摆放设施（规格书 02 §2.6）：设施消耗 1 个并按时长计时（× 荣誉延时），牌匾不消耗且永久；可以直接替换旧设施 */
export async function placeDevice(
  op: Op,
  slot: number,
  goodsId: number,
): Promise<{ slot: number; goodsId: number; expiresAt: string | null }> {
  const dev = op.config.devices.get(slot);
  if (!dev) throw invalidState('no_slot', { slot });
  if (!slotUnlocked(dev, op.rest)) throw requirement('slot_locked', { slot, needStar: dev.needStar });
  const g = op.config.requireGoods(goodsId);
  // 艺术品设施（2026-10-17）：金唱片（设施类型 9）乐台、屏风都能摆
  if (g.type !== GOODS_TYPE.device || !artFits(g.deviceType, dev.deviceType))
    throw invalidState('wrong_device', { slot, goodsId });
  // 金唱片全店同时只能摆一件：另一个艺术品位上还没到期的那张挡着（同一个位置上换掉自己不算）
  if (g.deviceType === DEVICE_TYPE.anyArt) {
    const other = await op.tx
      .selectFrom('restaurant_device')
      .select('slot')
      .where('rest_id', '=', op.rest.id)
      .where('goods_id', '=', goodsId)
      .where('slot', '!=', slot)
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', op.now)]))
      .executeTakeFirst();
    if (other) throw invalidState('art_in_use', { slot: other.slot });
  }
  // 后期海报奖杯按星级可用（问题记录 146）：从别处拿到的也装不上，道具不消耗
  if ((g.needStar ?? 0) > op.rest.star_level)
    throw requirement('star', { need: g.needStar, have: op.rest.star_level });
  if (g.deviceType === DEVICE_TYPE.plaque) {
    if ((await countGoods(op, goodsId)) < 1) throw notEnough('goods', 1, 0, goodsId);
    const other = await op.tx
      .selectFrom('restaurant_device')
      .select('slot')
      .where('rest_id', '=', op.rest.id)
      .where('goods_id', '=', goodsId)
      .where('slot', '!=', slot)
      .executeTakeFirst();
    if (other) throw invalidState('plaque_in_use', { slot: other.slot });
  } else {
    await consumeGoods(op, goodsId, 1);
  }
  const hours = deviceHours(g);
  const agg = await opAgg(op);
  const expiresAt =
    hours === null
      ? null
      : new Date(op.now.getTime() + Math.round(hours * (1 + (agg.extendTimeRate ?? 0)) * 3600_000));
  // 孕育道具（乾坤通景巨屏 2026-10-25）：覆盖这个位置前，先补发旧的一轮已经到点、后台任务还没来得及发的份数
  const old = await op.tx
    .selectFrom('restaurant_device')
    .select(['slot', 'goods_id', 'placed_at', 'expires_at', 'breed_done'])
    .where('rest_id', '=', op.rest.id)
    .where('slot', '=', slot)
    .forUpdate()
    .executeTakeFirst();
  if (old) await grantBreed(op, old);
  await op.tx
    .insertInto('restaurant_device')
    .values({
      rest_id: op.rest.id,
      slot,
      goods_id: goodsId,
      placed_at: op.now,
      expires_at: expiresAt,
      breed_done: 0,
    })
    .onConflict((oc) =>
      oc
        .columns(['rest_id', 'slot'])
        .doUpdateSet({ goods_id: goodsId, placed_at: op.now, expires_at: expiresAt, breed_done: 0 }),
    )
    .execute();
  // 孕育参数不进加成
  const effects = artEffectsOf(g.effects);
  await upsertEffectSource(op.tx, op.rest.id, { sourceType: 'device', sourceId: slot, effects, expiresAt });
  invalidateAgg(op);
  restLog(op, 'device.place', { slot, goodsId });
  await emitAction(op, 'device.place');
  return { slot, goodsId, expiresAt: expiresAt ? expiresAt.toISOString() : null };
}
