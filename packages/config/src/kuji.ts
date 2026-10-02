import type { Tuning } from './tuning';

/** 一池最多几张签：再多一次插入会超过 PG 的绑定参数上限，看板和抽签都会报错（一番赏终审） */
export const KUJI_MAX_TICKETS = 1000;

/**
 * 一番赏配置的引用检查（一番赏设计 §3、终审 I3）：档位不重复、不能叫 last（最后赏专用）、
 * 一池总张数不超过上限、图标存在、奖品引用的道具和食材存在。配置构建和后台保存区服数值都调用
 */
export function kujiErrors(
  k: Tuning['kuji'],
  ref: { goodsIds: ReadonlySet<number>; foodIds: ReadonlySet<number>; iconKeys: ReadonlySet<string> },
): string[] {
  const errors: string[] = [];
  const award = (where: string, a: Tuning['kuji']['last']['award']) => {
    for (const g of a.goods ?? [])
      if (!ref.goodsIds.has(g.id)) errors.push(`${where} references unknown goods ${g.id}`);
    for (const f of a.foods ?? [])
      if (!ref.foodIds.has(f.id)) errors.push(`${where} references unknown food ${f.id}`);
  };
  const seen = new Set<string>();
  for (const tier of k.tiers) {
    if (seen.has(tier.key)) errors.push(`tuning.kuji.tiers duplicate key ${tier.key}`);
    seen.add(tier.key);
    if (tier.key === 'last') errors.push('tuning.kuji.tiers key "last" is reserved for the last prize');
    if (tier.icon && !ref.iconKeys.has(tier.icon))
      errors.push(`tuning.kuji.tiers ${tier.key} icon ${tier.icon} not in looks.icons`);
    award(`tuning.kuji.tiers ${tier.key}`, tier.award);
  }
  const total = k.tiers.reduce((s, x) => s + x.count, 0);
  if (total > KUJI_MAX_TICKETS) errors.push(`tuning.kuji.tiers total ${total} > ${KUJI_MAX_TICKETS}`);
  if (k.last.icon && !ref.iconKeys.has(k.last.icon))
    errors.push(`tuning.kuji.last icon ${k.last.icon} not in looks.icons`);
  award('tuning.kuji.last', k.last.award);
  return errors;
}
