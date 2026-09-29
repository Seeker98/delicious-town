import type { CollectionTier, Tuning } from '@dt/config';

export interface CollectionCounts {
  /** 仓库里拥有的不同牌匾数 */
  plaques: number;
  /** 有效勋章数（不含街道勋章） */
  honors: number;
  pots: number;
  paintings: number;
  an2023: boolean;
  an2025: boolean;
  mdcg: boolean;
}

const RENAMED: ReadonlySet<string> = new Set(['coinRate', 'expRate']);

/** 达到的每一档都生效；coinRate/expRate 加前缀区分来源，其他键原样 */
function addTiers(out: Record<string, number>, count: number, tiers: CollectionTier[], prefix: string): void {
  for (const tier of tiers) {
    if (count < tier.count) continue;
    for (const [k, v] of Object.entries(tier.effects)) {
      const key = RENAMED.has(k) ? `${prefix}${k[0]!.toUpperCase()}${k.slice(1)}` : k;
      out[key] = (out[key] ?? 0) + v;
    }
  }
}

/** 收集类加成（规格书 20 §20.18、17）：集牌匾、集荣誉、集盆栽、集名画 */
export function collectionEffects(
  c: CollectionCounts,
  t: Tuning['collection'],
  potTiers: CollectionTier[],
  paintingTiers: CollectionTier[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const plaqueSum = c.plaques * t.plaquePer * (c.an2023 ? t.an2023Multiplier : 1);
  if (plaqueSum > 0) out.plaqueSum = plaqueSum;
  const honorAdd = c.honors * t.honorPer * (c.mdcg ? t.mdcgMultiplier : 1);
  if (honorAdd > 0) {
    out.honorAddCoin = honorAdd * (c.an2025 ? 1 + t.an2025CoinBonus : 1);
    out.honorAddExp = honorAdd;
  }
  addTiers(out, c.pots, potTiers, 'pot');
  addTiers(out, c.paintings, paintingTiers, 'painting');
  const top = paintingTiers.at(-1);
  if (top && c.paintings >= top.count) out.paintingTop = 1;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]! * 1e9) / 1e9;
  return out;
}
