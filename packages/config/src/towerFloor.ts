import { EQUIP_ATTRS, NON_SUIT_IDS } from './ids';
import type { EquipAttrs, Goods, SuitDef } from './types';

/**
 * 赛厨长老（问题记录 408）：每层长老穿当层全套厨具（强化到 stress），加满等级的属性点。
 * 数据在 game/tower_elders.json，由 `pnpm -F @dt/server elders` 模拟出最难打的分配后生成：
 * 厨具基础属性按正常随机的期望，强化增量和加点按最优分
 */
export interface ElderInput {
  floor: number;
  level: number;
  stress: number;
  /** 等级属性点：和玩家一样只能加厨艺、刀工、火候 */
  points: { cook: number; cutting: number; fire: number };
  pieces: Array<{ id: number; base: EquipAttrs; gain: EquipAttrs }>;
  /** 打赢时可能掉的厨具 */
  drops: number[];
}

export interface ElderContext {
  goods: ReadonlyMap<number, Goods>;
  suits: ReadonlyMap<number, SuitDef>;
  attrPerLevel: number;
  luckPerLevel: number;
}

const sum = (a: EquipAttrs) => EQUIP_ATTRS.reduce((s, k) => s + a[k], 0);

/** 数据和厨具配置对不上的地方 */
export function elderErrors(e: ElderInput, ctx: ElderContext): string[] {
  const out: string[] = [];
  const at = `tower_elders floor ${e.floor}`;
  const points = e.points.cook + e.points.cutting + e.points.fire;
  const want = ctx.attrPerLevel * (e.level - 1);
  if (points !== want) out.push(`${at}: points sum ${points}, expected ${want}`);
  const parts = new Set<number>();
  let stressOk = true;
  for (const p of e.pieces) {
    const def = ctx.goods.get(p.id)?.equip;
    if (!def) {
      out.push(`${at}: ${p.id} is not equipment`);
      continue;
    }
    if (parts.has(def.part)) out.push(`${at}: part ${def.part} used twice`);
    parts.add(def.part);
    if (def.total === null) {
      if (EQUIP_ATTRS.some((k) => p.base[k] !== def.ranges[k]))
        out.push(`${at}: piece ${p.id} base must equal its fixed attrs`);
    } else {
      if (sum(p.base) !== def.total)
        out.push(`${at}: piece ${p.id} base sums to ${sum(p.base)}, expected ${def.total}`);
      for (const k of EQUIP_ATTRS) {
        const r = def.ranges[k];
        const [lo, hi] = typeof r === 'number' ? [r, r] : r;
        if (p.base[k] < lo || p.base[k] > hi)
          out.push(`${at}: piece ${p.id} base ${k} ${p.base[k]} out of range [${lo}, ${hi}]`);
      }
    }
    if (stressOk && e.stress >= def.stressTable.length) {
      out.push(`${at}: stress ${e.stress} beyond piece ${p.id} table`);
      stressOk = false;
    }
    if (!stressOk) continue;
    const gain = def.stressTable[e.stress]! - def.stressTable[0]!;
    if (EQUIP_ATTRS.some((k) => p.gain[k] < 0)) out.push(`${at}: piece ${p.id} gain must not be negative`);
    else if (sum(p.gain) !== gain)
      out.push(`${at}: piece ${p.id} gain sums to ${sum(p.gain)}, expected ${gain}`);
  }
  for (const id of e.drops) if (!ctx.goods.get(id)?.equip) out.push(`${at}: drop ${id} is not equipment`);
  return out;
}

/**
 * 长老被挑战时的属性，和玩家同一套算法（equip/rules 的 attrSummary + tower/sides 的 sideOf）：
 * (加点 + 厨具) 的厨艺刀工火候调味乘套装百分比，厨艺刀工火候再乘防守加成；幸运 = 每级幸运 × (等级 − 1) + 厨具 + 套装幸运值
 */
export function elderAttrs(e: ElderInput, ctx: ElderContext): { attrs: EquipAttrs; power: number } {
  const raw: EquipAttrs = {
    cook: e.points.cook,
    cutting: e.points.cutting,
    fire: e.points.fire,
    season: 0,
    creatives: 0,
    luck: 0,
  };
  const counts = new Map<number, number>();
  for (const p of e.pieces) {
    for (const k of EQUIP_ATTRS) raw[k] += p.base[k] + p.gain[k];
    const suitId = ctx.goods.get(p.id)?.equip?.suitId ?? 0;
    if (!NON_SUIT_IDS.has(suitId) && ctx.suits.has(suitId)) counts.set(suitId, (counts.get(suitId) ?? 0) + 1);
  }
  const eff: Record<string, number> = {};
  for (const [id, n] of counts)
    for (const tier of ctx.suits.get(id)!.tiers)
      if (n >= tier.need) for (const [k, v] of Object.entries(tier.effects)) eff[k] = (eff[k] ?? 0) + v;
  const pct = (k: 'cook' | 'cutting' | 'fire' | 'season') => Math.round(raw[k] * (1 + (eff[`${k}Pct`] ?? 0)));
  const defend = (v: number, key: string) => Math.round(v * (1 + (eff[key] ?? 0)));
  const attrs: EquipAttrs = {
    cook: defend(pct('cook'), 'defendCook'),
    cutting: defend(pct('cutting'), 'defendCutting'),
    fire: defend(pct('fire'), 'defendFire'),
    season: pct('season'),
    creatives: raw.creatives,
    luck: ctx.luckPerLevel * (e.level - 1) + raw.luck + (eff.luckValue ?? 0),
  };
  const power =
    attrs.cook + attrs.cutting + attrs.fire + attrs.season + attrs.creatives + Math.floor(attrs.luck / 2);
  return { attrs, power };
}
