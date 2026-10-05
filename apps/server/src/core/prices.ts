import { FOODS, type Food } from '@dt/config';

/** 万能食材能顶替的等级（1~5，id = FOODS.masterBase + 等级，规格书 03 §3.3）；不是万能食材为 null。菜价倍率和交易所参考价共用 */
export function universalLevel(food: Food): number | null {
  const base = food.id - FOODS.masterBase;
  return food.level === 9 && base >= 1 && base <= 5 ? base : null;
}

/** 浮点尾数的容差：680 × 0.35 算出 237.99999…，向下取整前先补上（和交易所做市一致） */
const EPS = 1e-6;

/** 按菜价付的银币（问题记录 240-1）：菜价 × 菜价倍率，向下取整，不低于 1 */
export function dishCoin(base: number, rate: number): number {
  return Math.max(1, Math.floor(base * rate + EPS));
}

/** 食材的价格倍数：第 N 个是 N 级；万能食材按它能顶替的等级；没写的等级按 1 */
export function levelRateOf(food: Food, rates: readonly number[]): number {
  const level = universalLevel(food) ?? food.level;
  return rates[level - 1] ?? 1;
}

/**
 * 食材售价（问题记录 240-1）：基础价 × 本等级倍数，取整；菜场、交易所做市和参考价都用它。
 * 取整免得 1800 × 1.3 = 2340.0000000000005 在菜场向上取整时多收 1 银币
 */
export function foodPrice(food: Food, mt: { levelPriceRate: readonly number[] }): number {
  return Math.round(food.coin * levelRateOf(food, mt.levelPriceRate));
}
