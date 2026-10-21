import type { Food, GameConfig, Tuning } from '@dt/config';
import { foodPrice } from '../../core/prices';

/**
 * 冰箱收费（2026-10-22）：入库费、仓储费、解冻费都按菜场价（基础价 × 菜场价阶梯，不含天气）算，
 * 天气不影响，免得挑便宜天气往冰箱里塞
 */
export function fridgeUnitPrice(food: Food, t: Tuning): number {
  return foodPrice(food, t.market);
}

/** 入库费：份数 × 菜场价 × fridgeEntryRate，向上取整 */
export function fridgeEntryFee(food: Food, num: number, t: Tuning): number {
  return Math.ceil(num * fridgeUnitPrice(food, t) * t.cupboard.fridgeEntryRate);
}

/** 解冻费：份数 × 菜场价 × thawCoinRate，向上取整 */
export function fridgeThawFee(food: Food, num: number, t: Tuning): number {
  return Math.ceil(num * fridgeUnitPrice(food, t) * t.cupboard.thawCoinRate);
}

/** 冰箱格数（种类数）落在哪一档的倍数：到了 [从第几格起, 倍数] 的线就用那一档，整个冰箱都乘 */
export function fridgeTierMult(kinds: number, tiers: ReadonlyArray<readonly [number, number]>): number {
  let m = 1;
  for (const [from, mult] of tiers) if (kinds >= from) m = mult;
  return m;
}

export interface FridgeFeeQuote {
  /** 冰箱里有几种食材（格数） */
  kinds: number;
  /** 冰箱里食材的菜场价合计 */
  value: number;
  /** 这一档的倍数 */
  mult: number;
  /** 每天的仓储费 */
  daily: number;
}

/** 每日仓储费：冰箱里食材的菜场价合计 × fridgeDailyRate × 分档倍数，向上取整 */
export function fridgeDailyFee(
  items: ReadonlyArray<{ foodsId: number; num: number }>,
  config: GameConfig,
  t: Tuning,
): FridgeFeeQuote {
  const kept = items.filter((x) => x.num > 0);
  const value = kept.reduce((a, x) => a + x.num * fridgeUnitPrice(config.requireFood(x.foodsId), t), 0);
  const mult = fridgeTierMult(kept.length, t.cupboard.fridgeTiers);
  return { kinds: kept.length, value, mult, daily: Math.ceil(value * t.cupboard.fridgeDailyRate * mult) };
}
