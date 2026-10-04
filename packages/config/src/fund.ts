import { FUND_MEDALS } from './ids';
import type { Tuning } from './tuning';

/** 小镇发展基金的检查（240-2）：配置构建和后台保存区服数值都调用 */
export function fundErrors(f: Tuning['fund'], ref: { honorIds: ReadonlySet<number> }): string[] {
  const errors: string[] = [];
  if (f.earlyRate > f.returnRate)
    errors.push(`tuning.fund earlyRate ${f.earlyRate} must not exceed returnRate ${f.returnRate}`);
  const seen = new Set<string>();
  for (const t of f.tiers) {
    if (seen.has(t.key)) errors.push(`tuning.fund.tiers duplicate key ${t.key}`);
    seen.add(t.key);
    if (!ref.honorIds.has(t.medal))
      errors.push(`tuning.fund.tiers ${t.key} medal ${t.medal} is not an honor`);
    // 领取时会去掉身上全部基金勋章：填了别的荣誉会被当成基金勋章删掉
    else if (!FUND_MEDALS.has(t.medal))
      errors.push(`tuning.fund.tiers ${t.key} medal ${t.medal} is not a fund medal`);
  }
  return errors;
}
