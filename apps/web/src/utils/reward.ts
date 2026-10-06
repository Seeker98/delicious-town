import { HAT_PREFIX, type RewardItems } from '@dt/shared';
import { activeMessages } from '../i18n';
import { formatNum } from './format';

/** 附件摘要："银币 100、钻石 2、神秘礼券×3、玉•大橘之帽"（邮箱、后台共用） */
export function rewardSummary(
  i: RewardItems,
  names: { goodsName(id: number): string; foodName(id: number): string },
): string {
  const r = activeMessages().util.reward;
  const parts: string[] = [];
  if (i.coin) parts.push(r.coin(formatNum(i.coin)));
  if (i.diamond) parts.push(r.diamond(formatNum(i.diamond)));
  if (i.exp) parts.push(r.exp(formatNum(i.exp)));
  const q = activeMessages().common.qty;
  for (const g of i.goods ?? []) parts.push(q(names.goodsName(g.id), g.num));
  for (const f of i.foods ?? []) parts.push(q(names.foodName(f.id), f.num));
  for (const h of i.hats ?? []) parts.push(r.hat(HAT_PREFIX[h.tier], h.name));
  return parts.join(activeMessages().events.sep);
}
