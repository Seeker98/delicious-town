import {
  EQUIP_ATTRS,
  NON_SUIT_IDS,
  type EquipAttr,
  type EquipAttrs,
  type EquipDef,
  type SuitDef,
  type Tuning,
} from '@dt/config';
import { luckRate as toLuckRate, type Rng } from '@dt/shared';

export type EquipTuning = Tuning['equip'];

/** 各部位生成随机属性、强化选属性时的顺序，主属性在第一位（原版 DtRestEquip.getAttrSeq） */
const SEQ: Record<number, readonly EquipAttr[]> = {
  1: ['cook', 'cutting', 'fire', 'season', 'luck', 'creatives'],
  2: ['cutting', 'fire', 'season', 'cook', 'luck', 'creatives'],
  3: ['fire', 'season', 'cook', 'cutting', 'luck', 'creatives'],
  4: ['season', 'cook', 'cutting', 'fire', 'luck', 'creatives'],
  5: ['creatives', 'cook', 'cutting', 'fire', 'season', 'luck'],
};

export function attrSeq(part: number): readonly EquipAttr[] {
  const s = SEQ[part];
  if (!s) throw new Error(`bad equip part ${part}`);
  return s;
}

export function zeroAttrs(): EquipAttrs {
  return { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
}

export function addAttrs(a: EquipAttrs, b: EquipAttrs): EquipAttrs {
  const out = zeroAttrs();
  for (const k of EQUIP_ATTRS) out[k] = a[k] + b[k];
  return out;
}

/** 获得厨具时生成基础属性（原版 Tools.createEquipForStore） */
export function rollEquipAttrs(def: EquipDef, rng: Rng): EquipAttrs {
  const out = zeroAttrs();
  const seq = attrSeq(def.part);
  if (def.total === null) {
    for (const a of seq) {
      const r = def.ranges[a];
      out[a] = typeof r === 'number' ? r : r[0];
    }
    return out;
  }
  let left = def.total;
  seq.forEach((a, i) => {
    if (i === seq.length - 1) {
      out[a] = left;
      return;
    }
    const r = def.ranges[a];
    if (left === 0 || typeof r === 'number') return;
    const v = Math.min(r[0] + rng.int(r[1] - r[0] + 1), left);
    out[a] = v;
    left -= v;
  });
  return out;
}

export interface StressRate {
  base: number;
  luck: number;
  weather: number;
  floor: number;
  total: number;
}

/** 强化成功率分项（规格书 07 §7.7） */
export function stressRate(
  stress: number,
  luckSum: number,
  weatherRate: number,
  failStreak: number,
  t: EquipTuning,
): StressRate {
  const base = t.baseRate - t.ratePerStress * stress;
  const luck = toLuckRate(luckSum) / (stress + 1) / 4;
  const floor = failStreak * t.floorPerFail;
  return { base, luck, weather: weatherRate, floor, total: base + luck + weatherRate + floor };
}

/** 掷一次：幸运 = 只靠幸运那部分才成功；保底 = 只靠连续失败那部分才成功（原版 stressEquip） */
export function rollStress(
  rate: StressRate,
  stone: boolean,
  rng: Rng,
): { success: boolean; lucky: boolean; floor: boolean } {
  if (stone) return { success: true, lucky: false, floor: false };
  const r = rng.next();
  const success = r < rate.total;
  return {
    success,
    lucky: success && r >= rate.base + rate.weather,
    floor: success && r >= rate.base + rate.weather + rate.luck,
  };
}

/** 强化成功时加哪一项、加多少（原版 Tools.stressUpEquip） */
export function stressGain(
  part: number,
  mainBase: number,
  stone: boolean,
  rng: Rng,
): { attr: EquipAttr; val: number } {
  const seq = attrSeq(part);
  let attr = seq[seq.length - 1]!;
  for (const a of seq) {
    if (rng.next() < 0.5) {
      attr = a;
      break;
    }
  }
  const cap = Math.max(1, mainBase);
  let val = Math.max(1, rng.int(cap + 1));
  if (stone && val < cap) val += 1;
  return { attr, val };
}

export function gemRate(level: number, weatherRate: number, t: EquipTuning): number {
  return t.gemBaseRate - t.gemRatePerLevel * level + weatherRate;
}

/** 宝石升阶：每组独立，失败后再以幸运率补救（原版 levelUpGem） */
export function gemLevelUp(
  num: number,
  level: number,
  weatherRate: number,
  luckRate: number,
  t: EquipTuning,
  rng: Rng,
): { success: number; lucky: number; fail: number } {
  const base = gemRate(level, weatherRate, t);
  let success = 0;
  let lucky = 0;
  let fail = 0;
  for (let i = 0; i < num; i++) {
    if (rng.next() < base) success++;
    else if (rng.chance(luckRate)) {
      success++;
      lucky++;
    } else fail++;
  }
  return { success, lucky, fail };
}

export interface ActiveSuit {
  suit: SuitDef;
  count: number;
  /** 与 suit.tiers 一一对应 */
  active: boolean[];
}

/** 穿戴中各套装的件数和激活档位；0、90、99 和配置里没有的不算套装 */
export function activeSuits(suitIds: number[], suits: ReadonlyMap<number, SuitDef>): ActiveSuit[] {
  const counts = new Map<number, number>();
  for (const id of suitIds) {
    if (NON_SUIT_IDS.has(id) || !suits.has(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([id, count]) => {
      const suit = suits.get(id)!;
      return { suit, count, active: suit.tiers.map((tier) => count >= tier.need) };
    });
}

/** 进加成汇总的套装键（设计文档 裁定 2）：属性百分比、进攻 / 防守、探险留给展示和子项目 4 */
export function suitAggEffects(effects: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(effects)) {
    if (k.endsWith('Pct') || k.startsWith('attack') || k.startsWith('defend') || k === 'exploreSuccessRate')
      continue;
    out[k] = v;
  }
  return out;
}

export function suitPct(list: ActiveSuit[]): { cook: number; cutting: number; fire: number; season: number } {
  const out = { cook: 0, cutting: 0, fire: 0, season: 0 };
  for (const s of list) {
    s.suit.tiers.forEach((tier, i) => {
      if (!s.active[i]) return;
      out.cook += tier.effects.cookPct ?? 0;
      out.cutting += tier.effects.cuttingPct ?? 0;
      out.fire += tier.effects.firePct ?? 0;
      out.season += tier.effects.seasonPct ?? 0;
    });
  }
  return out;
}

/** 餐厅属性 = (加点 + 厨具) × (1 + 套装百分比)；厨力 = 五项之和 + ⌊幸运/2⌋（规格书 20 §20.18） */
export function attrSummary(
  points: EquipAttrs,
  gear: EquipAttrs,
  pct: { cook: number; cutting: number; fire: number; season: number },
): { total: EquipAttrs; power: number } {
  const total = addAttrs(points, gear);
  for (const k of ['cook', 'cutting', 'fire', 'season'] as const)
    total[k] = Math.round(total[k] * (1 + pct[k]));
  const power =
    total.cook + total.cutting + total.fire + total.season + total.creatives + Math.floor(total.luck / 2);
  return { total, power };
}
