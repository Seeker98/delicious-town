import type { Food, GameConfig, Tuning } from '@dt/config';

export type ExchangeTuning = Tuning['exchange'];

/** 可交易：稀有食材，和菜场判断稀有的口径一致（156-1 设计 §2） */
export function isTradable(food: Food | undefined): boolean {
  return food !== undefined && food.odds < 100;
}

/** 当天允许的挂单价（156-1 设计 §5） */
export function priceBand(ref: number, t: ExchangeTuning): { min: number; max: number } {
  return { min: Math.max(1, Math.ceil(ref * t.bandLow)), max: Math.floor(ref * t.bandHigh) };
}

/** 成交量加权均价，四舍五入 */
export function weightedPrice(trades: Array<{ price: number; qty: number }>): number {
  const qty = trades.reduce((s, x) => s + x.qty, 0);
  return Math.round(trades.reduce((s, x) => s + x.price * x.qty, 0) / qty);
}

/** 卖方手续费 */
export function feeOf(price: number, qty: number, t: ExchangeTuning): number {
  return Math.floor(price * qty * t.feeRate);
}

/** 万能食材的 id：466 + 对应的普通等级（规格书 03 §3.3，1~5 级） */
const UNIVERSAL_BASE = 466;
const CLAMP_LOW = 0.75;
const CLAMP_HIGH = 1.5;
const UNIVERSAL_FACTOR = 1.5;

const medianCache = new WeakMap<GameConfig, Map<number, number>>();
/** 各等级稀有食材系统定价的中位数（排好序取正中间，偶数个取靠上的一个） */
function rareMedians(config: GameConfig): Map<number, number> {
  const hit = medianCache.get(config);
  if (hit) return hit;
  const by = new Map<number, number[]>();
  for (const f of config.foods.values())
    if (isTradable(f) && f.level <= 7) by.set(f.level, [...(by.get(f.level) ?? []), f.coin]);
  const out = new Map<number, number>();
  for (const [lv, coins] of by) {
    coins.sort((a, b) => a - b);
    out.set(lv, coins[Math.floor(coins.length / 2)]!);
  }
  medianCache.set(config, out);
  return out;
}

/**
 * 没有成交前的初始参考价（问题记录 242）：
 * 普通食材用系统定价，但夹在同级稀有中位数的 0.75~1.5 倍（原作数据里个别 3 级食材比 4 级还贵）；
 * 万能食材能顶替任意同级食材，取同级稀有中位数 × 1.5
 */
export function initialRef(food: Food, config: GameConfig): number {
  const medians = rareMedians(config);
  const base = food.id - UNIVERSAL_BASE;
  if (food.level === 9 && base >= 1 && base <= 5) {
    const m = medians.get(base);
    if (m !== undefined) return Math.round(m * UNIVERSAL_FACTOR);
  }
  const m = medians.get(food.level);
  if (m === undefined) return food.coin;
  return Math.min(Math.max(food.coin, Math.ceil(m * CLAMP_LOW)), Math.floor(m * CLAMP_HIGH));
}
