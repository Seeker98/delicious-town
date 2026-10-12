import type { Tuning } from '@dt/config';

type T = Tuning['shiling'];

/** 这种天气当令的道（天气改版设计 §3.1）；表里没有的当没有 */
export function roadsOf(t: T, weatherId: number): number[] {
  return t.roads.find(([id]) => id === weatherId)?.[1] ?? [];
}

/** 下锅那一刻算不算应时（§3.2）：够星、生效天气当令这道菜所在的道 */
export function cookInSeason(t: T, star: number, weatherId: number, road: number): boolean {
  return star >= t.minStar && roadsOf(t, weatherId).includes(road);
}

/** 每份的时令值（§3.3）：菜等级 × (1 + gradeStep × (品级 − 1)) ÷ divisor，再乘 (1 + 天气的 shilingRate) */
export function portionPoints(t: T, level: number, grade: number, rate = 0): number {
  return ((level * (1 + t.gradeStep * (grade - 1))) / t.divisor) * (1 + rate);
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
