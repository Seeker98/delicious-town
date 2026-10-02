import type { Food, GameConfig, Tuning } from '@dt/config';
import type { WeightedPool } from '@dt/shared';
import type { ExchangeTuning } from './rules';

export type MakerTuning = ExchangeTuning['maker'];

/** 浮点误差：0.7 × 1800 = 1259.999…，取整前加减一点 */
const EPS = 1e-6;
const down = (x: number) => Math.floor(x + EPS);
const up = (x: number) => Math.ceil(x - EPS);

const cheapestCache = new WeakMap<GameConfig, number>();
/** 最便宜天气的菜场价格系数：1 + min(marketCoin)，没有降价天气时为 1 */
function cheapestWeather(config: GameConfig): number {
  const hit = cheapestCache.get(config);
  if (hit !== undefined) return hit;
  let lo = 0;
  for (const w of config.weather.values()) lo = Math.min(lo, w.effects.marketCoin ?? 0);
  cheapestCache.set(config, 1 + lo);
  return 1 + lo;
}

const inPool = (pool: WeightedPool<Food> | undefined, food: Food) =>
  pool?.items.some((x) => x.id === food.id) ?? false;
const hasLevel = (weights: Array<[number, number]>, level: number) =>
  weights.some(([lv, w]) => lv === level && w > 0);

/**
 * 菜场里能买到这种食材的最低单价（156-3 设计 §4.1）；菜场不卖返回 null。
 * 按进货用的食材池判断能上哪些货架，取最便宜的货架价，再乘最便宜天气和菜场价格倍率
 */
export function marketFloor(food: Food, config: GameConfig, mt: Tuning['market']): number | null {
  const pool = config.foodPools.get(food.level);
  const inLevel = inPool(pool, food);
  const prices: number[] = [];
  if (inLevel && hasLevel(mt.dailyLevelWeights, food.level)) prices.push(food.coin);
  if ((inLevel && hasLevel(mt.specialLevelWeights, food.level)) || inPool(config.hotFoodPool, food))
    prices.push(mt.specialPrice);
  if (inLevel && food.level === mt.premiumLevel) prices.push(food.coin * mt.premiumPriceFactor);
  if (prices.length === 0) return null;
  return Math.min(...prices) * cheapestWeather(config) * mt.priceFactor;
}

/** 系统的买价和卖价（156-3 设计 §4.2）：买价低于挂单下限时没有买这一档 */
export function makerPrices(
  ref: number,
  floor: number | null,
  band: { min: number; max: number },
  m: MakerTuning,
): { bid: number | null; ask: number } {
  let bid = down(ref * m.bidRate);
  if (floor !== null) bid = Math.min(bid, down(floor * m.marketCapRate));
  bid = Math.min(bid, band.max);
  const ask = Math.min(Math.max(up(ref * m.askRate), band.min), band.max);
  return { bid: bid >= band.min ? bid : null, ask };
}

/** 系统这次最多能收几个 */
export function makerBuyQty(m: MakerTuning, s: { bought: number; stock: number; playerToday: number }): number {
  return Math.max(0, Math.min(m.dailyBuy - s.bought, m.stockMax - s.stock, m.playerDaily - s.playerToday));
}
