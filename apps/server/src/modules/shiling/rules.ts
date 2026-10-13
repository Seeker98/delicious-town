import type { Food, Tuning } from '@dt/config';
import { foodPrice } from '../../core/prices';

type T = Tuning['shiling'];

/** 这种天气当令的道（天气改版设计 §3.1）；表里没有的当没有 */
export function roadsOf(t: T, weatherId: number): number[] {
  return t.roads.find(([id]) => id === weatherId)?.[1] ?? [];
}

/** 这一轮算不算应时（时令值改法 2026-10-13：按吃的那一轮判）：够星、本轮生效天气（道具盖着按盖的）当令这道菜所在的道 */
export function cookInSeason(t: T, star: number, weatherId: number, road: number): boolean {
  return star >= t.minStar && roadsOf(t, weatherId).includes(road);
}

/**
 * 每份的时令值（时令值改法 2026-10-13）：这道菜每种食材的现价（同菜场）之和 ÷ baseNum ÷ k × (1 + gradeStep × (品级 − 1))。
 * 按配方算：每种 1 份（下锅时每种扣 cookNum 份），烹饪魔书免掉的也算；用 baseNum 不用这一批的实际份数。
 * 天气的 shilingRate 入账时再乘，不在这里
 */
export function perPortion(
  t: T,
  mt: Pick<Tuning['mysterious'], 'baseNum'>,
  market: Pick<Tuning['market'], 'levelPriceRate'>,
  foods: readonly Food[],
  grade: number,
): number {
  const cost = foods.reduce((sum, f) => sum + foodPrice(f, market), 0);
  return (cost / mt.baseNum / t.k) * (1 + t.gradeStep * (grade - 1));
}

/** 每日衰减（时令值改法 2026-10-13）：余额超过 floor 的部分扣 rate，向下取整；返回要扣的点数 */
export function decayOf(balance: number, d: T['decay']): number {
  return balance > d.floor ? Math.floor((balance - d.floor) * d.rate + 1e-9) : 0;
}

/**
 * 一批应时菜被吃掉 n 份：小数累积在这一批上（acc），入账按累计的整数部分减去已入账的。
 * 返回新的 acc 和这次入账多少
 */
export function accrue(acc: number, paid: number, n: number, per: number): { acc: number; gain: number } {
  const next = acc + n * per;
  // 浮点误差：0.1 × 10 这类累计到 0.9999999 时按 1 算
  const whole = Math.floor(next + 1e-9);
  return { acc: next, gain: Math.max(0, whole - paid) };
}
