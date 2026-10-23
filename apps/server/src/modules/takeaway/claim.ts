import { GOODS } from '@dt/config';
import type { TakeawayClaimDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { questCounterKeys } from '../../core/questKeys';
import { invalidState } from '../../core/errors';
import { opAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { gainCoin, gainExp, gainRenown, spendDiamond } from '../../core/resources';
import { grantGoodsOp } from '../store/goods';
import { requireOpen } from './common';
import {
  addRiderExp,
  claimExp,
  droneDiamonds,
  FAIL_REASONS,
  fl,
  pickAward,
  riderCapAfter,
  riderExpGain,
} from './rules';
import { bumpCounters } from '../achieve/counters';

/**
 * 领取（设计文档 §3.4）。riderOp 是好友骑手店的操作（双店操作里的对方），自己当骑手时为 null。
 * 随机数顺序：成败 → 奖池 →（礼券数量）→ 神秘顾客 →（失败原因）
 */
export async function settleDelivery(
  o: Op,
  riderOp: Op | null,
  deliveryId: number,
  drone: boolean,
): Promise<TakeawayClaimDto> {
  const t = o.tuning.takeaway;
  const v = await o.tx
    .selectFrom('takeaway_delivery')
    .selectAll()
    .where('id', '=', deliveryId)
    .where('rest_id', '=', o.rest.id)
    .where('state', '=', 1)
    .forUpdate()
    .executeTakeFirst();
  if (!v) throw invalidState('delivery_gone');
  if (!drone && v.arrive_at > o.now)
    throw invalidState('not_arrived', { arriveAt: v.arrive_at.toISOString() });
  const rider = await o.tx
    .selectFrom('takeaway_rider')
    .selectAll()
    .where('id', '=', v.rider_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const self = rider.rider_rest_id === o.rest.id;
  // 计划裁定 9：进操作后以带锁读为准
  if (!self && riderOp?.rest.id !== rider.rider_rest_id) throw invalidState('delivery_gone');
  if (drone) spendDiamond(o, droneDiamonds(v.grade));
  const agg = await opAgg(o);
  const success = v.private || drone || o.rng.next() < v.success_odds / 1000;
  let exp = claimExp(v.exp, { friend: !self, private: v.private }, t);
  let coin = 0;
  let renown = 0;
  let goods: { id: number; num: number } | null = null;
  if (success) {
    coin = self ? v.coin : fl(v.coin * t.friendRiderRate);
    renown = v.renown;
    gainCoin(o, coin);
    gainRenown(o, renown);
    const id = pickAward(o.rng.next(), v.grade, t);
    const num = id === GOODS.mysteryTicket ? o.rng.intMin1(2 * v.grade) + (drone ? v.grade : 0) : 1;
    goods = { id, num: await grantGoodsOp(o, id, num) };
  } else if (!((agg.gugu ?? 0) > 0)) {
    exp = fl(exp * t.failExpRate);
  }
  gainExp(o, exp);
  if (success && riderOp && !self) {
    const rc = Math.floor(coin / t.rebateDiv);
    const re = Math.floor(exp / t.rebateDiv);
    gainCoin(riderOp, rc, { source: 'takeaway.rebate' });
    gainExp(riderOp, re, { source: 'takeaway.rebate' });
    restLog(riderOp, 'takeaway.rebate', { from: o.rest.id, coin: rc, exp: re });
  }
  const riderExp = riderExpGain({
    grade: v.grade,
    fail: !success,
    drone,
    kinds: v.mystery_kinds,
    rate: agg.riderExpRate ?? 0,
  });
  const up = addRiderExp(rider.level, rider.exp, riderExp, t);
  await o.tx
    .updateTable('takeaway_rider')
    .set({ level: up.level, exp: up.exp })
    .where('id', '=', rider.id)
    .execute();
  if (self && up.gained > 0) {
    const st = await requireOpen(o);
    const cap = riderCapAfter(st.rider_cap, rider.level, up.level, t);
    if (cap !== st.rider_cap)
      await o.tx
        .updateTable('takeaway_state')
        .set({ rider_cap: cap })
        .where('rest_id', '=', o.rest.id)
        .execute();
  }
  // 神秘顾客（送珊迪、派大星）2026-10-23 下架；旧记录里的 customer 照旧显示
  const customer: number | null = null;
  // 原因存序号和中文原文：前端按序号显示各语言（问题记录 272），旧记录只有原文
  const reasonId = success ? null : o.rng.int(FAIL_REASONS.length);
  const reason = reasonId === null ? null : FAIL_REASONS[reasonId]!;
  const result: TakeawayClaimDto = {
    deliveryId: v.id,
    success,
    drone,
    reason,
    reasonId,
    coin,
    exp,
    renown,
    goods,
    riderExp,
    riderLevel: up.level,
    customer,
  };
  await o.tx
    .updateTable('takeaway_delivery')
    .set({ state: success ? 2 : 3, drone, result: JSON.stringify(result), settled_at: o.now })
    .where('id', '=', v.id)
    .execute();
  await o.tx.updateTable('takeaway_order').set({ state: 3 }).where('id', '=', v.order_id).execute();
  restLog(o, 'takeaway.claim', { deliveryId: v.id, success, coin, exp, renown });
  await emitAction(o, 'takeaway.deliver');
  // 隐藏成就“屡败屡送”
  if (!success) await bumpCounters(o, [['takeaway.fail', 1]]);
  // 支线“外卖进阶”（问题记录 515）：用无人机送、送成 5 星以上的单
  if (drone) await emitAction(o, 'takeaway.drone');
  if (success && v.grade >= 5) await emitAction(o, 'takeaway.grade5');
  // 支线“四海为家”按店所在的街道另记（问题记录 515：在杂碎街送外卖）；只记任务用得上的街
  const onStreet = `takeaway.deliver.street.${o.rest.street_id}`;
  if (questCounterKeys(o.config).has(onStreet)) await emitAction(o, onStreet);
  return result;
}
