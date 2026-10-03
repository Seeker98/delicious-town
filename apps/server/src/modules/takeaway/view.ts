import type { Kysely } from 'kysely';
import { GOODS, type GameConfig, type Tuning } from '@dt/config';
import { gameDay, type TakeawayDto, type TakeawayOrderDto, type TakeawayRiderDto } from '@dt/shared';
import type { DB, RestaurantRow, TakeawayOrderRow, TakeawayRiderRow } from '../../db/schema';
import { mergeNeed } from '../cookbook/rules';
import { getDaily } from '../counter/dailyCounter';
import { foodsMap } from '../cupboard/foods';
import { getEffectAgg } from '../effects/service';
import { busyByRider, KEY, levelsOf, stateOf, validNum } from './common';
import { droneDiamonds, riderAttrs, type TakeawayTuning } from './rules';

export function riderDto(
  r: TakeawayRiderRow,
  name: string,
  busy: number,
  t: TakeawayTuning,
): TakeawayRiderDto {
  const a = riderAttrs(r.level, t);
  const self = r.rider_rest_id === r.rest_id;
  return {
    id: r.id,
    restId: r.rider_rest_id,
    name,
    self,
    level: r.level,
    exp: r.exp,
    needExp: a.needExp,
    timeSub: a.timeSub,
    expAdd: a.expAdd,
    coinAdd: a.coinAdd,
    renownAdd: a.renownAdd,
    odds: a.odds,
    maxNum: a.maxNum,
    busy,
    dismissCoin: self ? 0 : r.exp * t.rider.dismissCoin,
    dismissExp: self ? 0 : r.exp * t.rider.dismissExp,
  };
}

/** 一张单：要的食材（按我这道菜的品级；没学会按品级 1）和不能接的原因 */
function orderDto(
  o: TakeawayOrderRow,
  config: GameConfig,
  myGrade: number,
  have: (id: number) => number,
  renown: number,
  me: number,
): TakeawayOrderDto {
  const cb = config.requireCookbook(o.cookbook_id);
  const foods = mergeNeed(cb.needFoods[Math.max(1, myGrade)] ?? []).map((f) => ({
    foodsId: f.foodsId,
    need: f.num * o.grade,
    have: have(f.foodsId),
  }));
  const block =
    myGrade < 1
      ? 'not_learned'
      : renown < o.need_renown
        ? 'renown'
        : foods.some((f) => f.have < f.need)
          ? 'foods'
          : null;
  return {
    id: o.id,
    cookbookId: o.cookbook_id,
    cookbookName: cb.name,
    grade: o.grade,
    needMinutes: o.need_minutes,
    needRenown: o.need_renown,
    expiresAt: o.expires_at.toISOString(),
    private: o.owner_rest_id === me,
    foods,
    block,
  };
}

/** 概览（设计文档 §5）：没开通时只给开通条件 */
export async function takeawayView(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  tuning: Tuning,
  now: Date,
): Promise<TakeawayDto> {
  const t = tuning.takeaway;
  const base = {
    open: {
      needStar: t.openStar,
      needRenown: t.openRenown,
      needCoin: t.openCoin,
      needDiamond: t.openDiamond,
      tickets: await validNum(db, rest.id, GOODS.takeawayTicket, now),
    },
    star: rest.star_level,
    renown: rest.renown,
    coin: rest.coin,
    diamond: rest.diamond,
    now: now.toISOString(),
  };
  const state = await stateOf(db, rest.id);
  if (!state)
    return {
      ...base,
      opened: false,
      orders: [],
      deliveries: [],
      riders: [],
      riderCap: 0,
      canDouble: false,
      refresh: { cost: t.refreshCoin, hasJob: false },
    };
  const levels = await levelsOf(db, rest.id);
  const cupboard = await foodsMap(db, rest.id);
  const have = (id: number) => cupboard.get(id)?.num ?? 0;
  const orders = await db
    .selectFrom('takeaway_order')
    .selectAll()
    .where('shard_id', '=', rest.shard_id)
    .where('state', '=', 1)
    .where('expires_at', '>', now)
    .where((eb) => eb.or([eb('owner_rest_id', 'is', null), eb('owner_rest_id', '=', rest.id)]))
    .orderBy('expires_at')
    .orderBy('id')
    .execute();
  const deliveries = await db
    .selectFrom('takeaway_delivery as v')
    .innerJoin('takeaway_order as o', 'o.id', 'v.order_id')
    .innerJoin('takeaway_rider as r', 'r.id', 'v.rider_id')
    .innerJoin('restaurant as x', 'x.id', 'r.rider_rest_id')
    .select([
      'v.id',
      'v.order_id',
      'v.grade',
      'v.private',
      'v.double',
      'v.rider_id',
      'v.arrive_at',
      'o.cookbook_id',
      'x.name',
    ])
    .where('v.rest_id', '=', rest.id)
    .where('v.state', '=', 1)
    .orderBy('v.arrive_at')
    .orderBy('v.id')
    .execute();
  const riders = await db
    .selectFrom('takeaway_rider as r')
    .innerJoin('restaurant as x', 'x.id', 'r.rider_rest_id')
    .selectAll('r')
    .select('x.name')
    .where('r.rest_id', '=', rest.id)
    .orderBy('r.id')
    .execute();
  const busy = await busyByRider(db, rest.id);
  const times = await getDaily(db, rest.id, KEY.refresh, gameDay(now));
  const agg = await getEffectAgg(db, rest.id, now, config, tuning);
  return {
    ...base,
    opened: true,
    orders: orders.map((o) => orderDto(o, config, levels[o.cookbook_id] ?? 0, have, rest.renown, rest.id)),
    deliveries: deliveries.map((v) => ({
      id: v.id,
      orderId: v.order_id,
      cookbookId: v.cookbook_id,
      cookbookName: config.cookbooks.get(v.cookbook_id)?.name ?? '',
      grade: v.grade,
      private: v.private,
      double: v.double,
      riderId: v.rider_id,
      riderName: v.name,
      arriveAt: v.arrive_at.toISOString(),
      arrived: v.arrive_at <= now,
      drone: droneDiamonds(v.grade),
    })),
    riders: riders
      .map((r) => riderDto(r, r.name, busy.get(r.id) ?? 0, t))
      .sort((a, b) => Number(b.self) - Number(a.self) || a.id - b.id),
    riderCap: state.rider_cap,
    canDouble: (agg.taFoodsDoubleFlag ?? 0) > 0,
    refresh: {
      cost: t.refreshCoin * (times + 1),
      hasJob: (await validNum(db, rest.id, GOODS.shopJobHonor, now)) > 0,
    },
  };
}
