import type { Tuning } from './tuning';

/** 许愿树中奖的限时称号（许愿树设计 §1.2） */
export const WISH_TREE_ICON = 'wish_tree';

/** 许愿树的检查（许愿树设计 §2）：配置构建和后台保存区服数值都调用；下架的道具由 retiredErrors 管 */
export function wishTreeErrors(
  t: Tuning['wishTree'],
  ref: { goodsIds: ReadonlySet<number>; iconKeys: ReadonlySet<string> },
): string[] {
  const errors: string[] = [];
  const seen = new Set<number>();
  for (const p of t.prizes) {
    if (!ref.goodsIds.has(p.goods)) errors.push(`tuning.wishTree prizes goods ${p.goods} does not exist`);
    if (seen.has(p.goods)) errors.push(`tuning.wishTree prizes goods ${p.goods} is listed twice`);
    seen.add(p.goods);
  }
  if (!ref.iconKeys.has(WISH_TREE_ICON))
    errors.push(`tuning.wishTree icon ${WISH_TREE_ICON} not in looks.icons`);
  return errors;
}
