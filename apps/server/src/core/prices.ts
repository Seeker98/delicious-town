import type { Food } from '@dt/config';

/** 万能食材 467~471 顶替 1~5 级（和交易所参考价 exchange/rules.ts 一致） */
const UNIVERSAL_BASE = 466;

/** 按菜价付的银币（问题记录 240-1）：菜价 × 菜价倍率，向下取整，不低于 1 */
export function dishCoin(base: number, rate: number): number {
  return Math.max(1, Math.floor(base * rate));
}

/** 食材的价格倍数：第 N 个是 N 级；万能食材按它能顶替的等级；没写的等级按 1 */
export function levelRateOf(food: Food, rates: readonly number[]): number {
  const base = food.id - UNIVERSAL_BASE;
  const level = food.level === 9 && base >= 1 && base <= 5 ? base : food.level;
  return rates[level - 1] ?? 1;
}

/** 食材售价（问题记录 240-1）：基础价 × 本等级倍数；菜场、交易所做市和参考价都用它 */
export function foodPrice(food: Food, mt: { levelPriceRate: readonly number[] }): number {
  return food.coin * levelRateOf(food, mt.levelPriceRate);
}
