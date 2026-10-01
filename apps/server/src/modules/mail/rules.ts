import type { RewardItems } from '@dt/shared';

export type ClaimBlock = 'mail_claimed' | 'mail_no_items' | 'mail_level';

/** 附件是否有东西（null 或空对象都算没有） */
export function hasItems(items: RewardItems | null): items is RewardItems {
  return items !== null && Object.keys(items).length > 0;
}

/** 领取的阻挡原因（设计 裁定 3、5）；等级按领取那一刻算 */
export function claimBlock(
  m: { items: RewardItems | null; claimed: boolean; minLevel: number | null },
  level: number,
): ClaimBlock | null {
  if (!hasItems(m.items)) return 'mail_no_items';
  if (m.claimed) return 'mail_claimed';
  if (m.minLevel !== null && level < m.minLevel) return 'mail_level';
  return null;
}
