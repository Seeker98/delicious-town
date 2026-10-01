import {
  DEVICE_TYPE,
  goodsEffectHours,
  GOODS_TYPE,
  type Award,
  type GiftItem,
  type Goods,
  type ShardSettings,
} from '@dt/config';
import { luckRate, pickWeighted } from '@dt/shared';
import { applyExp } from '../../core/level';
import { planAddFoods } from '../../modules/cupboard/foods';
import { computeEffectAgg } from '../../modules/effects/aggregate';
import { newFastRest, type FastCtx, type FastRest } from './state';

/**
 * 快速模型的原语（快速模拟设计 §4.3）：每个函数都对应一个真实服务里的函数，规则照抄，
 * 只是把数据库读写换成内存。真实规则改了要同步改这里（核对命令会发现跑偏）。
 */

function record(c: FastCtx, source: string, kind: 'coin' | 'exp' | 'diamond', n: number): void {
  if (n <= 0) return;
  const x = (c.stats.income[source] ??= { coin: 0, exp: 0, diamond: 0 });
  x[kind] += n;
}

// ---------- 资源（core/resources.ts） ----------

/** 银币最低到 0（白食可以是负数） */
export function gainCoin(c: FastCtx, r: FastRest, n: number, source = 'other'): void {
  if (n === 0) return;
  r.coin = Math.max(0, r.coin + n);
  record(c, source, 'coin', n);
}

/** 真实代码不够时抛错；这里返回 false，由调用方决定跳过 */
export function spendCoin(_c: FastCtx, r: FastRest, n: number, _source = 'other'): boolean {
  if (n <= 0) return true;
  if (r.coin < n) return false;
  r.coin -= n;
  return true;
}

export function gainDiamond(c: FastCtx, r: FastRest, n: number, source = 'other'): void {
  if (n === 0) return;
  r.diamond += n;
  record(c, source, 'diamond', n);
}

export function spendDiamond(_c: FastCtx, r: FastRest, n: number): boolean {
  if (n <= 0) return true;
  if (r.diamond < n) return false;
  r.diamond -= n;
  return true;
}

/** 体力可以超过上限（体力卡） */
export function gainStrength(_c: FastCtx, r: FastRest, n: number): void {
  r.strength += n;
}

export function spendStrength(_c: FastCtx, r: FastRest, n: number): boolean {
  if (n <= 0) return true;
  if (r.strength < n) return false;
  r.strength -= n;
  return true;
}

export function gainRenown(_c: FastCtx, r: FastRest, n: number): void {
  r.renown += n;
}

export function gainOil(_c: FastCtx, r: FastRest, n: number): number {
  const add = Math.max(0, Math.min(n, r.oilMax - r.oil));
  r.oil += add;
  return add;
}

/** 经验入账并升级：每级加属性点、幸运、餐桌上限 */
export function gainExp(c: FastCtx, r: FastRest, n: number, source = 'other'): number {
  if (n <= 0) return 0;
  const x = applyExp(r.level, r.exp, n);
  r.exp = x.exp;
  record(c, source, 'exp', n);
  if (x.gained > 0) {
    const t = c.tuning.rest;
    r.level = x.level;
    r.attrLeft += t.attrPerLevel * x.gained;
    r.luck += t.luckPerLevel * x.gained;
    r.tableNum += t.tablesPerLevel * x.gained;
  }
  return x.gained;
}

// ---------- 道具（store/grant.ts、store/goods.ts） ----------

export function countGoods(c: FastCtx, r: FastRest, goodsId: number): number {
  const s = r.store.get(goodsId);
  if (!s) return 0;
  if (s.expiresAt && s.expiresAt <= c.now) return 0;
  return s.num;
}

/** 勋章数量恒为 1、刷新有效期并成为加成来源；厨具不进仓库（快速模型忽略）；其他累加到持有上限 */
export function grantGoods(
  c: FastCtx,
  r: FastRest,
  goodsId: number,
  num: number,
  _source = 'other',
  hours?: number | null,
): number {
  if (num <= 0) return 0;
  const g = c.config.requireGoods(goodsId);
  if (g.type === GOODS_TYPE.equip) return num;
  const isHonor = g.type === GOODS_TYPE.honor;
  const h = isHonor ? (hours !== undefined ? hours : goodsEffectHours(g)) : null;
  const expiresAt = h !== null ? new Date(c.now.getTime() + h * 3600_000) : null;
  const have = r.store.get(goodsId)?.num ?? 0;
  const target = isHonor ? 1 : Math.min(have + num, g.maxNum);
  r.store.set(goodsId, { num: target, expiresAt });
  if (isHonor) {
    const sourceType = c.config.isStreetMedal(g) ? 'street' : 'honor';
    r.effects = r.effects.filter((e) => !(e.sourceType === sourceType && e.sourceId === g.id));
    r.effects.push({ sourceType, sourceId: g.id, effects: g.effects, expiresAt });
    r.aggDirty = true;
  } else if (g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque && have === 0) {
    r.aggDirty = true;
  }
  return isHonor ? 1 : target - have;
}

export function consumeGoods(c: FastCtx, r: FastRest, goodsId: number, num: number): boolean {
  if (num <= 0) return true;
  if (countGoods(c, r, goodsId) < num) return false;
  const s = r.store.get(goodsId)!;
  s.num -= num;
  if (s.num === 0) {
    r.store.delete(goodsId);
    r.aggDirty = true;
  }
  return true;
}

// ---------- 食材（cupboard/foods.ts） ----------

export function foodNum(r: FastRest, foodsId: number): number {
  return r.foods.get(foodsId) ?? 0;
}

export function slotsUsed(r: FastRest): number {
  let n = 0;
  for (const v of r.foods.values()) if (v > 0) n += 1;
  return n;
}

/** 已有的加到上限，溢出进冰箱；没有且格子满了全部进冰箱；冰箱也满就丢弃 */
export function addFoods(_c: FastCtx, r: FastRest, foodsId: number, num: number): void {
  if (num <= 0) return;
  const p = planAddFoods(
    {
      have: foodNum(r, foodsId),
      fridge: r.fridge.get(foodsId) ?? 0,
      slotsUsed: slotsUsed(r),
      slots: r.cupboardNum,
      max: r.foodsMaxNum,
    },
    num,
  );
  if (p.toCupboard > 0) r.foods.set(foodsId, foodNum(r, foodsId) + p.toCupboard);
  if (p.toFridge > 0) r.fridge.set(foodsId, (r.fridge.get(foodsId) ?? 0) + p.toFridge);
}

export function subFoods(_c: FastCtx, r: FastRest, foodsId: number, num: number): boolean {
  if (num <= 0) return true;
  const have = foodNum(r, foodsId);
  if (have < num) return false;
  r.foods.set(foodsId, have - num);
  return true;
}

// ---------- 加成（effects/service.ts） ----------

export function aggOf(c: FastCtx, r: FastRest): Record<string, number> {
  const stale = r.aggDirty || !r.aggCache || (r.aggNextExpire !== null && r.aggNextExpire <= c.now);
  if (!stale) return r.aggCache!;
  const owned = new Set<number>();
  for (const [id, s] of r.store) if (s.num > 0) owned.add(id);
  const { agg, nextExpireAt } = computeEffectAgg(r.effects, owned, c.config, c.tuning, c.now);
  r.aggCache = agg;
  r.aggNextExpire = nextExpireAt;
  r.aggDirty = false;
  return agg;
}

export function luckOf(c: FastCtx, r: FastRest): { sum: number; rate: number } {
  const sum = r.luck + (aggOf(c, r).luckValue ?? 0);
  return { sum, rate: luckRate(sum) };
}

// ---------- 奖励和礼包（award/award.ts） ----------

export function grantAward(c: FastCtx, r: FastRest, award: Award, source = 'other', multiplier = 1): void {
  const m = multiplier;
  if (award.coin) gainCoin(c, r, Math.floor(award.coin * m), source);
  if (award.exp) gainExp(c, r, Math.floor(award.exp * m), source);
  if (award.diamond) gainDiamond(c, r, Math.floor(award.diamond * m), source);
  if (award.renown) gainRenown(c, r, Math.floor(award.renown * m));
  for (const g of award.goods ?? []) grantGoods(c, r, g.id, g.num * m, source);
  for (const f of award.foods ?? []) addFoods(c, r, f.id, f.num * m);
}

function randRange(c: FastCtx, min: number, max: number): number {
  return max > min ? min + c.rng.int(max - min) : min;
}

function pickGiftFood(c: FastCtx, item: Extract<GiftItem, { type: 'foods' }>): number | null {
  if (item.id !== undefined && item.id > 0) return item.id;
  if (item.flag === 'master') {
    return c.config.masterFoodPool.total > 0 ? pickWeighted(c.config.masterFoodPool, c.rng).id : null;
  }
  const pool = c.config.foodPools.get(Number(item.flag));
  return pool && pool.total > 0 ? pickWeighted(pool, c.rng).id : null;
}

/** 打开礼包 times 次：每项独立按 rate + 幸运率判定（照抄 openGift） */
export function openGift(c: FastCtx, r: FastRest, goods: Goods, times: number, source = 'other'): void {
  const items = goods.gift ?? [];
  const lr = luckOf(c, r).rate;
  const goodsAdd = new Map<number, number>();
  const foodsAdd = new Map<number, number>();
  for (let i = 0; i < times; i++) {
    for (const item of items) {
      if (c.rng.next() >= item.rate + lr) continue;
      switch (item.type) {
        case 'goods': {
          let id: number | null = item.id;
          if (!(id > 0)) {
            const pool = c.config.randomGoodsIds(item.level ?? 1);
            id = pool.length === 0 ? null : pool[c.rng.int(pool.length)]!;
          }
          if (id !== null) goodsAdd.set(id, (goodsAdd.get(id) ?? 0) + item.num);
          break;
        }
        case 'foods': {
          const id = pickGiftFood(c, item);
          if (id !== null) foodsAdd.set(id, (foodsAdd.get(id) ?? 0) + item.num);
          break;
        }
        case 'coin':
          gainCoin(c, r, randRange(c, item.min, item.max), source);
          break;
        case 'exp':
          gainExp(c, r, randRange(c, item.min, item.max), source);
          break;
        case 'diamond':
          gainDiamond(c, r, randRange(c, item.min, item.max), source);
          break;
        case 'renown':
          gainRenown(c, r, item.num);
          break;
      }
    }
  }
  for (const [id, n] of goodsAdd) grantGoods(c, r, id, n, source);
  for (const [id, n] of foodsAdd) addFoods(c, r, id, n);
}

// ---------- 行为计数（task/handler.ts） ----------

/** 全历史计数（任务）+ 当日活跃（按 actionMap 找到活跃项、星级够时） */
export function action(c: FastCtx, r: FastRest, key: string, n = 1): void {
  r.counters.set(key, (r.counters.get(key) ?? 0) + n);
  const name = c.config.bundle.actionMap.activation[key];
  if (!name) return;
  const act = c.config.activationByName.get(name);
  if (!act || r.star < act.needStar) return;
  const k = `act:${act.id}`;
  r.daily.set(k, (r.daily.get(k) ?? 0) + n);
}

// ---------- 开店（restaurant/service.ts 的 open） ----------

export function openFastRest(c: FastCtx, id: number, settings: ShardSettings): FastRest {
  const r = newFastRest(id, c.config, settings);
  for (const g of settings.restaurant.giftGoods) grantGoods(c, r, g.id, g.num, 'restaurant.create');
  for (const f of settings.restaurant.giftFoods) r.foods.set(f.id, (r.foods.get(f.id) ?? 0) + f.num);
  return r;
}
