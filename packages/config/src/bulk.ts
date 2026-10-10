import type { Tuning } from './tuning';

/** 特许大宗认购的检查（大宗认购设计 §2.1）：配置构建和后台保存区服数值都调用 */
export function bulkErrors(t: Tuning['bulk'], ref: { goodsIds: ReadonlySet<number> }): string[] {
  const errors: string[] = [];
  // 每人上限向下取整、成团向上取整：capRate < groupRate 时一个人成不了团
  if (t.capRate >= t.groupRate)
    errors.push(`tuning.bulk capRate ${t.capRate} must be less than groupRate ${t.groupRate}`);
  t.qty.forEach((n, i) => {
    if (Math.floor(Math.round(n * t.capRate * 1e6) / 1e6) < 1)
      errors.push(`tuning.bulk qty level ${i + 1} (${n}) gives a per-person cap of 0`);
  });
  if (t.closeWindowMin >= t.hours * 60)
    errors.push(`tuning.bulk closeWindowMin ${t.closeWindowMin} must be shorter than hours ${t.hours}`);
  if (!ref.goodsIds.has(t.consolation.goods))
    errors.push(`tuning.bulk consolation goods ${t.consolation.goods} does not exist`);
  return errors;
}
