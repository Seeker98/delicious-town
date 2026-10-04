import { dishCoin } from '../../core/prices';
import type { TakeawayDeliveryDto } from '@dt/shared';
import { invalidState, limitReached, notEnough, requirement } from '../../core/errors';
import { opAgg } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { gainRenown } from '../../core/resources';
import { mergeNeed } from '../cookbook/rules';
import { foodsMap, subFoods } from '../cupboard/foods';
import { busyCount, levelsOf, requireOpen, riderLuckRate } from './common';
import { droneDiamonds, orderValues, riderAttrs, sumBonus } from './rules';

/**
 * 接单（设计文档 §3.3）。检查顺序：开通 → 单 → 骑手 → 学会 → 加料 → 声望 → 食材；
 * 抢单用"状态仍可接且没过期才改"的更新，改不到报 order_taken。随机数：成功率浮动
 */
export async function deliverOrder(
  o: Op,
  weather: Record<string, number>,
  b: { orderId: number; riderId: number; double: boolean },
): Promise<TakeawayDeliveryDto> {
  const t = o.tuning.takeaway;
  await requireOpen(o);
  const order = await o.tx
    .selectFrom('takeaway_order')
    .selectAll()
    .where('id', '=', b.orderId)
    .where('shard_id', '=', o.shardId)
    .executeTakeFirst();
  if (!order || (order.owner_rest_id !== null && order.owner_rest_id !== o.rest.id) || order.state === 3)
    throw invalidState('order_gone');
  if (order.state === 2) throw invalidState('order_taken');
  if (order.expires_at <= o.now) throw invalidState('order_gone');
  const rider = await o.tx
    .selectFrom('takeaway_rider as r')
    .innerJoin('restaurant as x', 'x.id', 'r.rider_rest_id')
    .selectAll('r')
    .select('x.name')
    .where('r.id', '=', b.riderId)
    .where('r.rest_id', '=', o.rest.id)
    .executeTakeFirst();
  if (!rider) throw invalidState('rider_gone');
  const attrs = riderAttrs(rider.level, t);
  if ((await busyCount(o.tx, rider.id)) >= attrs.maxNum)
    throw limitReached('rider_busy', { max: attrs.maxNum });
  const myGrade = (await levelsOf(o.tx, o.rest.id))[order.cookbook_id] ?? 0;
  if (myGrade < 1) throw requirement('not_learned');
  const agg = await opAgg(o);
  if (b.double && !((agg.taFoodsDoubleFlag ?? 0) > 0)) throw requirement('double');
  if (o.rest.renown < order.need_renown) throw notEnough('renown', order.need_renown, o.rest.renown);
  const cb = o.config.requireCookbook(order.cookbook_id);
  const mult = order.grade * (b.double ? 2 : 1);
  const lines = mergeNeed(cb.needFoods[myGrade] ?? []).map((f) => ({
    foodsId: f.foodsId,
    num: f.num * mult,
  }));
  const have = await foodsMap(o.tx, o.rest.id);
  for (const l of lines) {
    const h = have.get(l.foodsId)?.num ?? 0;
    if (h < l.num) throw notEnough('foods', l.num, h, l.foodsId);
  }
  const taken = await o.tx
    .updateTable('takeaway_order')
    .set({ state: 2 })
    .where('id', '=', order.id)
    .where('state', '=', 1)
    .where('expires_at', '>', o.now)
    .returning('id')
    .executeTakeFirst();
  if (!taken) throw invalidState('order_taken');
  for (const l of lines) await subFoods(o, l.foodsId, l.num);
  gainRenown(o, -order.need_renown);
  const v = orderValues(
    {
      price: dishCoin(cb.coin, o.tuning.settlement.dishCoinRate),
      grade: order.grade,
      myGrade,
      level: o.rest.level,
      needMinutes: order.need_minutes,
      rider: attrs,
      bonus: sumBonus(weather, agg),
      luckRate: await riderLuckRate(o, rider.rider_rest_id),
      floatRoll: o.rng.int(t.successFloat),
    },
    t,
  );
  const arriveAt = new Date(o.now.getTime() + v.minutes * 60_000);
  const isPrivate = order.owner_rest_id !== null;
  const row = await o.tx
    .insertInto('takeaway_delivery')
    .values({
      order_id: order.id,
      rest_id: o.rest.id,
      rider_id: rider.id,
      grade: order.grade,
      private: isPrivate,
      double: b.double,
      mystery_kinds: lines.filter((l) => o.config.foods.get(l.foodsId)?.level === 7).length,
      coin: v.coin,
      exp: v.exp,
      renown: v.renown,
      success_odds: v.odds,
      started_at: o.now,
      arrive_at: arriveAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  restLog(o, 'takeaway.deliver', { orderId: order.id, cookbookId: order.cookbook_id, grade: order.grade });
  return {
    id: row.id,
    orderId: order.id,
    cookbookId: order.cookbook_id,
    cookbookName: cb.name,
    grade: order.grade,
    private: isPrivate,
    double: b.double,
    riderId: rider.id,
    riderName: rider.name,
    arriveAt: arriveAt.toISOString(),
    arrived: false,
    drone: droneDiamonds(order.grade),
  };
}
