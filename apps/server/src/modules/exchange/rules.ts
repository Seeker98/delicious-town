import { levelRateOf, universalLevel } from '../../core/prices';
import type { Food, GameConfig, Tuning } from '@dt/config';

export type ExchangeTuning = Tuning['exchange'];

/** 稀有食材：odds < 100，和菜场判断稀有的口径一致（156-1 设计 §2） */
export function isRare(food: Food | undefined): boolean {
  return food !== undefined && food.odds < 100;
}

/**
 * 可交易：全部食材（2026-10-22 起普通食材也能挂单，只在玩家之间成交，系统不收不卖，见 makerQuote）
 */
export function isTradable(food: Food | undefined, closedLevels: readonly number[] = []): boolean {
  // 下架的食材（问题记录 367）不再上交易所：别人手里的也不能再流到新玩家手上；
  // closedLevels 是区服关掉的等级（问题记录 461：六级暂定不交易）
  return food !== undefined && !food.retired && !closedLevels.includes(food.level);
}

/** 当天允许的挂单价（156-1 设计 §5） */
export function priceBand(ref: number, t: ExchangeTuning): { min: number; max: number } {
  return { min: Math.max(1, Math.ceil(ref * t.bandLow)), max: Math.floor(ref * t.bandHigh) };
}

/** 卖方手续费；rate 是卖方的费率（持有交易所经纪人的按证上的，天气改版 PR③） */
export function feeOf(price: number, qty: number, rate: number): number {
  return Math.floor(price * qty * rate);
}

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
    if (isRare(f) && isTradable(f) && f.level <= 7) by.set(f.level, [...(by.get(f.level) ?? []), f.coin]);
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
 * 万能食材能顶替任意同级食材，取同级稀有中位数 × 1.5；
 * 最后乘公允价阶梯（2026-10-15，万能食材按它顶替的等级）
 */
export function initialRef(food: Food, config: GameConfig, rates: readonly number[]): number {
  return Math.round(baseRef(food, config) * levelRateOf(food, rates));
}

/** 不算等级价格倍数的初始参考价（initialRef 原来的规则） */
function baseRef(food: Food, config: GameConfig): number {
  const medians = rareMedians(config);
  const base = universalLevel(food);
  if (base !== null) {
    const m = medians.get(base);
    if (m !== undefined) return Math.round(m * UNIVERSAL_FACTOR);
  }
  const m = medians.get(food.level);
  if (m === undefined) return food.coin;
  return Math.min(Math.max(food.coin, Math.ceil(m * CLAMP_LOW)), Math.floor(m * CLAMP_HIGH));
}
