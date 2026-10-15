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
 * 菜场价（问题记录 240-1）：基础价 × 菜场价阶梯，取整；菜场日常、高级货架和时令点数用它。
 * 取整免得 1800 × 1.3 = 2340.0000000000005 在菜场向上取整时多收 1 银币
 */
export function foodPrice(food: Food, mt: { levelPriceRate: readonly number[] }): number {
  return Math.round(food.coin * levelRateOf(food, mt.levelPriceRate));
}

/** 公允价（公允价阶梯 2026-10-15）：基础价 × 公允价阶梯，取整；期货、大宗和交易所做市用它 */
export function fairFoodPrice(food: Food, mt: { fairPriceRate: readonly number[] }): number {
  return Math.round(food.coin * levelRateOf(food, mt.fairPriceRate));
}

/** 特价货架单价（公允价阶梯 2026-10-15）：按食材等级（万能食材按顶替的等级），没写的等级按 specialPrice */
export function specialShelfPrice(
  food: Food,
  mt: { specialPrice: number; specialPrices: ReadonlyArray<readonly [number, number]> },
): number {
  const level = universalLevel(food) ?? food.level;
  return mt.specialPrices.find(([lv]) => lv === level)?.[1] ?? mt.specialPrice;
}

/**
 * 本金 × 比例向下取整。比例先换成整数百万分比再乘，免得 700,000 × 0.7 算成 489,999.99…（backlog 基金），
 * 也不会像加一点点那样在 3 × 0.333333 时多给 1（质量期 ②）；比例超过 6 位小数的部分不算
 */
export const share = (coin: number, rate: number) => Math.floor((coin * Math.round(rate * 1e6)) / 1e6);
