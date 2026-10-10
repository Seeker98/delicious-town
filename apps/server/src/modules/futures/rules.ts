import type { Tuning } from '@dt/config';

export type FuturesTuning = Tuning['futures'];

/** 去掉乘法的浮点误差再向上取整：9000 × 1.2 = 10800.000000000002 不能算成 10801 */
const ceilClean = (x: number): number => Math.ceil(Math.round(x * 1e6) / 1e6);

/** 期货单价（期货设计 §3）：基准 = clamp(参考价, 等级价, 等级价 × capRate)，单价 = ceil(基准 × premium) */
export function futuresUnitPrice(levelPrice: number, ref: number, t: FuturesTuning): number {
  const base = Math.min(Math.max(ref, levelPrice), levelPrice * t.capRate);
  return ceilClean(base * t.premium);
}

/** 定金 = ceil(总价 × depositRate)；尾款 = 总价 − 定金 */
export const futuresDeposit = (total: number, t: FuturesTuning): number => ceilClean(total * t.depositRate);

/** 区服每天每种的额度：列表里单独设了的优先（0 也算），否则按等级默认 */
export const futuresQuota = (level: number, override: number | null, t: FuturesTuning): number =>
  override ?? t.dailyQuota[level - 1] ?? 0;
