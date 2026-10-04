import { deviceHours, DEVICE_TYPE, GOODS_TYPE } from '@dt/config';
import { emitAction } from '../../core/action';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { invalidateAgg, opAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { removeEffectSource, upsertEffectSource } from '../effects/service';
import { slotUnlocked } from '../restaurant/reads';
import { consumeGoods, countGoods } from '../store/goods';

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
  if (g.type !== GOODS_TYPE.device || g.deviceType !== dev.deviceType)
    throw invalidState('wrong_device', { slot, goodsId });
  // 后期海报奖杯按星级可用（问题记录 146）：从别处拿到的也装不上，道具不消耗
  if ((g.needStar ?? 0) > op.rest.star_level) throw requirement('star', { need: g.needStar });
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
  await op.tx
    .insertInto('restaurant_device')
    .values({ rest_id: op.rest.id, slot, goods_id: goodsId, placed_at: op.now, expires_at: expiresAt })
    .onConflict((oc) =>
      oc
        .columns(['rest_id', 'slot'])
        .doUpdateSet({ goods_id: goodsId, placed_at: op.now, expires_at: expiresAt }),
    )
    .execute();
  const { time: _time, ...effects } = g.effects;
  await upsertEffectSource(op.tx, op.rest.id, { sourceType: 'device', sourceId: slot, effects, expiresAt });
  invalidateAgg(op);
  restLog(op, 'device.place', { slot, goodsId });
  await emitAction(op, 'device.place');
  return { slot, goodsId, expiresAt: expiresAt ? expiresAt.toISOString() : null };
}

/** 撤下设施：设施不退还（牌匾本来就不消耗） */
export async function removeDevice(op: Op, slot: number): Promise<{ slot: number }> {
  await op.tx
    .deleteFrom('restaurant_device')
    .where('rest_id', '=', op.rest.id)
    .where('slot', '=', slot)
    .execute();
  await removeEffectSource(op.tx, op.rest.id, 'device', slot);
  invalidateAgg(op);
  return { slot };
}
