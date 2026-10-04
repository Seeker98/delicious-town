import { z } from 'zod';
import type { GameConfig } from '@dt/config';
import { collectionEffects } from '../../modules/effects/collection';
import type { Persona } from '../bot';
import { gainCoin, gainDiamond, gainExp, gainRenown, gainStrength, grantGoods } from './ops';
import type { FastCtx, FastRest } from './state';

/** 旁支产出表（快速模拟设计 §5）：按来源和等级段写每天平均产出 */
export const SIDE_SOURCES = [
  'town',
  'hiphop',
  'bar',
  'yard',
  'tower',
  'temple',
  'takeaway',
  'equip',
] as const;
export type SideSource = (typeof SIDE_SOURCES)[number];

const nonNeg = z.number().min(0);
const rowSchema = z
  .object({
    source: z.enum(SIDE_SOURCES),
    minLevel: z.number().int().min(1),
    coin: nonNeg.optional(),
    exp: nonNeg.optional(),
    diamond: nonNeg.optional(),
    strength: nonNeg.optional(),
    renown: nonNeg.optional(),
    goods: z
      .array(z.object({ id: z.number().int().positive(), num: z.number().int().positive() }))
      .optional(),
    effects: z.record(z.number()).optional(),
    note: z.string().optional(),
  })
  .strict();
const share = z.number().min(0).max(1);
const tableSchema = z
  .object({
    participation: z.object({ diligent: share, normal: share, casual: share }).strict(),
    rows: z.array(z.unknown()),
  })
  .strict();

export type SideRow = z.infer<typeof rowSchema>;
export interface SideTable {
  participation: Record<Persona['key'], number>;
  rows: SideRow[];
}

/** 游戏认识的加成键：道具和天气里出现过的，加上收藏派生出来的 */
function knownEffectKeys(config: GameConfig): Set<string> {
  const keys = new Set<string>();
  for (const g of config.goods.values()) for (const k of Object.keys(g.effects)) keys.add(k);
  for (const w of config.weather.values()) for (const k of Object.keys(w.effects)) keys.add(k);
  const derived = collectionEffects(
    { plaques: 99, honors: 99, pots: 99, paintings: 99, an2023: true, an2025: true, mdcg: true },
    config.tuning.collection,
    config.bundle.potTiers,
    config.bundle.paintingTiers,
  );
  for (const k of Object.keys(derived)) keys.add(k);
  return keys;
}

/** 加载并校验；出错时抛 Error，信息带行号 */
export function loadSideTable(json: unknown, config: GameConfig): SideTable {
  const t = tableSchema.parse(json);
  const keys = knownEffectKeys(config);
  const rows = t.rows.map((raw, i) => {
    const p = rowSchema.safeParse(raw);
    if (!p.success) throw new Error(`rows[${i}]: ${p.error.issues.map((x) => x.message).join('；')}`);
    for (const g of p.data.goods ?? [])
      if (!config.goods.has(g.id)) throw new Error(`rows[${i}]: 道具 ${g.id} 不存在`);
    for (const k of Object.keys(p.data.effects ?? {}))
      if (!keys.has(k)) throw new Error(`rows[${i}]: 加成键 ${k} 游戏里没有`);
    return p.data;
  });
  return { participation: t.participation, rows };
}

/** 每个来源取 minLevel 不超过当前等级的最高一行；没有满足的就不发 */
export function rowsFor(t: SideTable, level: number): SideRow[] {
  const best = new Map<SideSource, SideRow>();
  for (const r of t.rows) {
    if (r.minLevel > level) continue;
    const cur = best.get(r.source);
    if (!cur || r.minLevel > cur.minLevel) best.set(r.source, r);
  }
  return [...best.values()];
}

/** 每天一次：数值按参与度向下取整；常驻加成不打折，按当前等级段整体替换 */
export function applySide(c: FastCtx, r: FastRest, t: SideTable, persona: Persona['key']): void {
  const share = t.participation[persona];
  const n = (x: number | undefined) => Math.floor((x ?? 0) * share);
  const rows = rowsFor(t, r.level);
  r.effects = r.effects.filter((e) => e.sourceType !== 'side');
  for (const row of rows) {
    const source = `side.${row.source}`;
    // 外卖单价乘菜价倍率（240-1），产出表里外卖的银币按同样比例折算
    const rate = row.source === 'takeaway' ? c.tuning.settlement.dishCoinRate : 1;
    gainCoin(c, r, Math.floor(n(row.coin) * rate), source);
    gainExp(c, r, n(row.exp), source);
    gainDiamond(c, r, n(row.diamond), source);
    gainStrength(c, r, n(row.strength));
    gainRenown(c, r, n(row.renown));
    for (const g of row.goods ?? []) grantGoods(c, r, g.id, n(g.num), source);
    if (row.effects && Object.keys(row.effects).length > 0) {
      r.effects.push({
        sourceType: 'side',
        sourceId: SIDE_SOURCES.indexOf(row.source),
        effects: row.effects,
        expiresAt: null,
      });
    }
  }
  r.aggDirty = true;
}
