import type { Tuning } from './tuning';

/** 一池最多几张签：再多一次插入会超过 PG 的绑定参数上限，看板和抽签都会报错（一番赏终审） */
export const KUJI_MAX_TICKETS = 1000;

/**
 * 一番赏配置的引用检查（一番赏设计 §3、终审 I3）：档位不重复、不能叫 last（最后赏专用）、
 * 一池总张数不超过上限、图标存在、奖品引用的道具和食材存在。配置构建和后台保存区服数值都调用
 */
type KujiRef = {
  goodsIds: ReadonlySet<number>;
  foodIds: ReadonlySet<number>;
  iconKeys: ReadonlySet<string>;
  /** 豪华池按月轮换的称号（240-2） */
  deluxeMonths: ReadonlyArray<{ month: string; icons: Readonly<Record<string, string>> }>;
  /** 活跃奖励的各档分数 */
  activationPoints: ReadonlySet<number>;
};

export function kujiErrors(k: Tuning['kuji'], ref: KujiRef): string[] {
  // 豪华一番赏（240-2）一起检查，错误写明 deluxe
  const errors = [...lineErrors('tuning.kuji', k, ref), ...lineErrors('tuning.kuji.deluxe', k.deluxe, ref)];
  // 送券的活跃档要真有：配错时任务页会写一个领不到的档，券也永远送不出去（质量期 ②）
  if (!ref.activationPoints.has(k.activeTicketPoints))
    errors.push(`tuning.kuji.activeTicketPoints ${k.activeTicketPoints} is not an activation reward`);
  // 月度称号对照的档位要是豪华档位：区服在后台把 A 改名成 S 后，A 赏会一直发固定称号（质量期 ②）
  const deluxeKeys = new Set([...k.deluxe.tiers.map((x) => x.key), 'last']);
  const seenMonth = new Set<string>();
  for (const m of ref.deluxeMonths) {
    if (seenMonth.has(m.month)) errors.push(`kuji deluxeMonths duplicate month ${m.month}`);
    seenMonth.add(m.month);
    for (const [key, icon] of Object.entries(m.icons)) {
      if (!deluxeKeys.has(key)) errors.push(`kuji deluxeMonths ${m.month} key ${key} is not a deluxe tier`);
      if (!ref.iconKeys.has(icon)) errors.push(`kuji deluxeMonths ${m.month} icon ${icon} not in looks.icons`);
    }
  }
  return errors;
}

/** 一条奖池线的检查；prefix 写进错误信息，区分普通池和豪华池 */
function lineErrors(prefix: string, k: Pick<Tuning['kuji'], 'tiers' | 'last'>, ref: KujiRef): string[] {
  const errors: string[] = [];
  const award = (where: string, a: Tuning['kuji']['last']['award']) => {
    for (const g of a.goods ?? [])
      if (!ref.goodsIds.has(g.id)) errors.push(`${where} references unknown goods ${g.id}`);
    for (const f of a.foods ?? [])
      if (!ref.foodIds.has(f.id)) errors.push(`${where} references unknown food ${f.id}`);
  };
  const seen = new Set<string>();
  for (const tier of k.tiers) {
    if (seen.has(tier.key)) errors.push(`${prefix}.tiers duplicate key ${tier.key}`);
    seen.add(tier.key);
    if (tier.key === 'last') errors.push(`${prefix}.tiers key "last" is reserved for the last prize`);
    if (tier.icon && !ref.iconKeys.has(tier.icon))
      errors.push(`${prefix}.tiers ${tier.key} icon ${tier.icon} not in looks.icons`);
    award(`${prefix}.tiers ${tier.key}`, tier.award);
  }
  const total = k.tiers.reduce((s, x) => s + x.count, 0);
  if (total > KUJI_MAX_TICKETS) errors.push(`${prefix}.tiers total ${total} > ${KUJI_MAX_TICKETS}`);
  if (k.last.icon && !ref.iconKeys.has(k.last.icon))
    errors.push(`${prefix}.last icon ${k.last.icon} not in looks.icons`);
  award(`${prefix}.last`, k.last.award);
  return errors;
}
