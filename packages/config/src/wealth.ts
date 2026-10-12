import type { Tuning } from './tuning';

/** 食材理财的检查（理财设计 §3.1）：配置构建和后台保存区服数值都调用 */
/** maxNumOf：道具的持有上限；一笔存满合计上限时给的包数不能超过它，不然领取永远报“放不下”、本金卡住（backlog） */
export function wealthErrors(
  w: Tuning['wealth'],
  ref: { packIds: ReadonlySet<number>; maxNumOf: (goodsId: number) => number | undefined },
): string[] {
  const errors: string[] = [];
  if (w.maxTotal < w.unit)
    errors.push(`tuning.wealth maxTotal ${w.maxTotal} must not be less than unit ${w.unit}`);
  const seen = new Set<number>();
  for (const t of w.terms) {
    if (seen.has(t.days)) errors.push(`tuning.wealth.terms duplicate days ${t.days}`);
    seen.add(t.days);
    if (!ref.packIds.has(t.goods))
      errors.push(`tuning.wealth.terms ${t.days} days goods ${t.goods} is not a market pack`);
    const most = Math.floor(w.maxTotal / w.unit) * t.perUnit;
    const max = ref.maxNumOf(t.goods);
    if (max !== undefined && most > max)
      errors.push(
        `tuning.wealth.terms ${t.days} days gives up to ${most} packs, over goods ${t.goods} max ${max}`,
      );
  }
  return errors;
}
