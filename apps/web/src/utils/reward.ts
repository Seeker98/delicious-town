import { HAT_PREFIX, type RewardItems } from '@dt/shared';
import { formatNum } from './format';

/** 附件摘要："银币 100、钻石 2、神秘礼券×3、玉•大橘之帽"（邮箱、后台共用） */
export function rewardSummary(
  i: RewardItems,
  names: { goodsName(id: number): string; foodName(id: number): string },
): string {
  const parts: string[] = [];
  if (i.coin) parts.push(`银币 ${formatNum(i.coin)}`);
  if (i.diamond) parts.push(`钻石 ${formatNum(i.diamond)}`);
  if (i.exp) parts.push(`经验 ${formatNum(i.exp)}`);
  for (const g of i.goods ?? []) parts.push(`${names.goodsName(g.id)}×${g.num}`);
  for (const f of i.foods ?? []) parts.push(`${names.foodName(f.id)}×${f.num}`);
  for (const h of i.hats ?? []) parts.push(`${HAT_PREFIX[h.tier]}•${h.name}之帽`);
  return parts.join('、');
}
