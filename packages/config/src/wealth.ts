import type { Tuning } from './tuning';

/** 食材理财的检查（理财设计 §3.1）：配置构建和后台保存区服数值都调用 */
export function wealthErrors(w: Tuning['wealth'], ref: { packIds: ReadonlySet<number> }): string[] {
  const errors: string[] = [];
  if (w.maxTotal < w.unit)
    errors.push(`tuning.wealth maxTotal ${w.maxTotal} must not be less than unit ${w.unit}`);
  const seen = new Set<number>();
  for (const t of w.terms) {
    if (seen.has(t.days)) errors.push(`tuning.wealth.terms duplicate days ${t.days}`);
    seen.add(t.days);
    if (!ref.packIds.has(t.goods))
      errors.push(`tuning.wealth.terms ${t.days} days goods ${t.goods} is not a market pack`);
  }
  return errors;
}
