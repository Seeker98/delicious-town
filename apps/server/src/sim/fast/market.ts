import { GOODS, type GameConfig, type Tuning } from '@dt/config';
import { gameParts, nextSlot, slotKey, type Rng } from '@dt/shared';
import { personLimit, rollShelf, unitPrice, type Shelf } from '../../modules/market/rules';
import { action, addFoods, consumeGoods, countGoods, foodNum, grantAward, slotsUsed, spendCoin } from './ops';
import type { FastCtx, FastRest } from './state';

/** 一件货（market_item 表）；bought 是按店计的已购数量 */
export interface FastShelfItem {
  id: number;
  shelf: Shelf;
  foodsId: number;
  stock: number;
  sold: number;
  openedAt: Date;
  bought: Map<number, number>;
}

/** 模拟区服的菜场：货架、竞猜报名（店 → 时段和选的食材）、每个货架上次上新的时段 */
export interface FastMarket {
  items: FastShelfItem[];
  guesses: Map<number, { period: string; foods: number[] }>;
  nextId: number;
  lastKey: [string, string, string];
}

export function newMarket(): FastMarket {
  return { items: [], guesses: new Map(), nextId: 1, lastKey: ['', '', ''] };
}

const HOURS = (t: Tuning['market']): [number[], number[], number[]] => [
  t.dailyHours,
  t.specialHours,
  t.premiumHours,
];

/**
 * 到了上新时刻就换这个货架的货（market/service.ts 的 refresh）。
 * 日常货架上新时返回新货的食材 id 和时段（用来开奖竞猜），否则返回 null
 */
export function restockIfDue(
  m: FastMarket,
  config: GameConfig,
  tuning: Tuning,
  now: Date,
  rngFor: (tag: string) => Rng,
): { foods: number[]; key: string; hour: number } | null {
  const { day, hour } = gameParts(now);
  let opened: { foods: number[]; key: string; hour: number } | null = null;
  HOURS(tuning.market).forEach((hours, i) => {
    const shelf = i as Shelf;
    if (!hours.includes(hour)) return;
    const key = slotKey(day, hour);
    if (m.lastKey[shelf] === key) return;
    m.lastKey[shelf] = key;
    const rolled = rollShelf(shelf, hour, config, tuning.market, rngFor(`market:${shelf}:${key}`));
    m.items = m.items.filter((x) => x.shelf !== shelf);
    for (const x of rolled) {
      m.items.push({
        id: m.nextId++,
        shelf,
        foodsId: x.foodsId,
        stock: x.stock,
        sold: 0,
        openedAt: now,
        bought: new Map(),
      });
    }
    if (shelf === 0) opened = { foods: rolled.map((x) => x.foodsId), key, hour };
  });
  return opened;
}

/**
 * 买菜（market/service.ts 的 buyTx）：特价货架当作邮箱已验证、不算同网络冷却（设计 §4.6）；
 * 高级货架要有效的爱心项链；格子、单种上限、按店限购、库存、银币都够才买
 */
export function marketBuy(
  c: FastCtx,
  r: FastRest,
  m: FastMarket,
  itemId: number,
  num: number,
  weather: Record<string, number>,
): boolean {
  if (num <= 0) return false;
  const item = m.items.find((x) => x.id === itemId);
  if (!item) return false;
  const t = c.tuning.market;
  const food = c.config.requireFood(item.foodsId);
  if (item.shelf === 2 && countGoods(c, r, GOODS.loveNecklace) <= 0) return false;
  const have = foodNum(r, food.id);
  if (have === 0 && slotsUsed(r) >= r.cupboardNum) return false;
  if (have + num > r.foodsMaxNum) return false;
  const limit = personLimit(item.shelf, food, item.openedAt, c.now, t);
  const bought = item.bought.get(r.id) ?? 0;
  if (bought + num > limit) return false;
  if (item.sold + num > item.stock) return false;
  if (!spendCoin(c, r, Math.ceil(unitPrice(item.shelf, food, t, weather) * num), 'market.buy')) return false;
  item.sold += num;
  item.bought.set(r.id, bought + num);
  addFoods(c, r, food.id, num);
  action(c, r, 'market.buy');
  return true;
}

/** 竞猜报名（joinGuess）：每个时段每店一次，扣神秘礼券 */
export function joinGuess(c: FastCtx, r: FastRest, m: FastMarket, foodsIds: number[]): boolean {
  const t = c.tuning.market;
  const ids = [...new Set(foodsIds)];
  if (ids.length === 0 || ids.length > t.guessMaxPick) return false;
  if (ids.some((id) => !c.config.guessFoodIds.has(id))) return false;
  const period = nextSlot(c.now, t.dailyHours).key;
  if (m.guesses.get(r.id)?.period === period) return false;
  if (!consumeGoods(c, r, GOODS.mysteryTicket, t.guessCost)) return false;
  m.guesses.set(r.id, { period, foods: ids });
  action(c, r, 'market.guess');
  return true;
}

/** 日常货架上新时开奖（settleGuess）：按命中数发奖，奖励时段再发加奖 */
export function settleGuesses(
  c: FastCtx,
  rests: ReadonlyMap<number, FastRest>,
  m: FastMarket,
  opened: number[],
  key: string,
  hour: number,
): void {
  for (const [restId, g] of [...m.guesses]) {
    if (g.period !== key) continue;
    m.guesses.delete(restId);
    const r = rests.get(restId);
    if (!r) continue;
    const hits = g.foods.filter((id) => opened.includes(id)).length;
    const award = c.config.bundle.guessAwards.find((a) => a.hits === hits);
    if (award) grantAward(c, r, award.award, 'market.guess');
    if (c.tuning.market.guessBonusHours.includes(hour)) {
      const bonus = c.config.bundle.guessBonus.find((b) => hits >= b.minHits);
      if (bonus) grantAward(c, r, bonus.award, 'market.guess');
    }
  }
}
