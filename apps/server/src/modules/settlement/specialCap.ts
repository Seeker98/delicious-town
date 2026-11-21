import type { Tuning } from '@dt/config';

/**
 * 特色菜限速（docs/design/特色菜限速-方案-2026-11-21.md）：不改每份卖价，只改每轮吃掉的份数。
 * 每桌特色菜的钱，期望不超过这桌厨艺钱的 specialFameCap 倍；挑剔桌的厨艺钱是 F，普通桌是 F × fame.normalShare
 */

/** 不限速时满意的挑剔顾客每桌吃几份 */
export const PICKY_PORTIONS = 2;

type Settlement = Tuning['settlement'];

/**
 * 每桌满意的挑剔顾客平均吃几份：min(2, cap × F ÷ 每份卖价)。
 * 每份卖价 = 每份价值 × 卖出倍率，不含特色菜银币率（用户 2026-11-21：加成照样提高每轮收入）
 */
export function pickyPortionsPerTable(fame: number, unitPrice: number, cap: number): number {
  if (cap <= 0 || unitPrice <= 0) return PICKY_PORTIONS;
  return Math.min(PICKY_PORTIONS, (cap * fame) / unitPrice);
}

/**
 * 现在每桌卖多快：满意的挑剔顾客每桌平均吃几份、普通顾客约几成的桌吃 1 份（特色菜页显示，也是下面应卖份数的每桌那一项）。
 * 普通顾客的上限：cap × F × fame.normalShare ÷ (每份卖价 × 普通顾客付的成数)，不超过 normalSpecialShare
 */
export function specialSpeed(
  fame: number,
  unitPrice: number,
  t: Settlement,
): { picky: number; normalShare: number; capped: boolean } {
  const cap = t.specialFameCap;
  const picky = pickyPortionsPerTable(fame, unitPrice, cap);
  const pay = unitPrice * t.normalSpecialPriceRate;
  const normalShare =
    cap <= 0 || pay <= 0
      ? t.normalSpecialShare
      : Math.min(t.normalSpecialShare, (cap * fame * t.fame.normalShare) / pay);
  return { picky, normalShare, capped: picky < PICKY_PORTIONS || normalShare < t.normalSpecialShare };
}

/**
 * 一轮应卖份数（带小数）。普通顾客没碰到上限时照旧是 ⌊普通桌数 × normalSpecialShare⌋（用户 2026-11-21：
 * 奇数桌的半份不留到下一轮，和改动前一样），碰到上限才取 普通桌数 × 上面的每桌比例
 */
export function specialDue(
  o: { satisfied: number; normals: number; fame: number; unitPrice: number },
  t: Settlement,
): { picky: number; normal: number } {
  const v = specialSpeed(o.fame, o.unitPrice, t);
  const base = Math.floor(o.normals * t.normalSpecialShare + 1e-9);
  return { picky: o.satisfied * v.picky, normal: Math.min(base, o.normals * v.normalShare) };
}

/** 应卖份数加上一轮的零头，取整数份卖，余下的零头留到下一轮（0 ≤ 零头 < 1） */
export function takeWhole(due: number, carry: number): { n: number; carry: number } {
  const x = due + carry;
  const n = Math.floor(x + 1e-9);
  return { n, carry: Math.max(0, x - n) };
}
