import type { Tuning } from '@dt/config';
import { gameParts, type Rng } from '@dt/shared';

export type YardTuning = Tuning['yard'];
export type EventTuning = YardTuning['events'];

/** 作物的可变状态（yard_plant 的一部分列）；阶段 1 幼年期、2 育苗期、3 成长期、4 收获期、5 枯叶期 */
export interface PlantState {
  stage: number;
  stage_at: Date;
  feed_min: number;
  infancy: number;
  maturity: number;
  autumn: number;
  harvest: number;
  harvest_num: number;
  worm: number;
  grass: number;
  dry: number;
}

const MIN = 60_000;

/** 土地升到下一级所需经验（规格书 20 §20.7，裁定 2） */
export function landExpNeed(level: number): number {
  return (level - 1) ** 2 * 2000 + 1000;
}

/** 加土地经验，逐级扣除；满级后经验归 0、不再累计（计划裁定 5） */
export function applyLandExp(
  level: number,
  exp: number,
  gain: number,
  maxLevel: number,
): { level: number; exp: number } {
  let l = level;
  let e = exp + gain;
  while (l < maxLevel && e >= landExpNeed(l)) {
    e -= landExpNeed(l);
    l += 1;
  }
  return { level: l, exp: l >= maxLevel ? 0 : e };
}

/** 土地产量加成（%） */
export function landBonus(level: number, t: YardTuning): number {
  return (level - 1) * t.yieldPerLevel;
}

/** 第 n 块地（从 1 数）的开垦价 */
export function landPrice(n: number, t: YardTuning): number {
  return t.landBaseCoin * 2 ** n;
}

export function harvestNumOf(seedNum: number, bonus: number): number {
  return Math.floor((seedNum * (100 + bonus)) / 100);
}

/** 某阶段的时长（分钟）；枯叶期 0 */
export function stageMinutes(p: PlantState, stage = p.stage): number {
  if (stage === 1) return p.infancy;
  if (stage === 2) return p.maturity;
  if (stage === 3) return p.autumn;
  if (stage === 4) return p.harvest;
  return 0;
}

/** 生长期（1~3）能浇水的时刻；其他阶段 null */
export function waterAt(p: PlantState): Date | null {
  if (p.stage < 1 || p.stage > 3) return null;
  return new Date(p.stage_at.getTime() + (stageMinutes(p) - p.feed_min) * MIN);
}

export function canWater(p: PlantState, now: Date): boolean {
  const w = waterAt(p);
  return w !== null && w.getTime() <= now.getTime();
}

/** 生长期：还要几分钟能浇水；收获期：还有几分钟枯萎；枯叶期 0 */
export function minutesLeft(p: PlantState, now: Date): number {
  const end = p.stage === 4 ? p.stage_at.getTime() + p.harvest * MIN : waterAt(p)?.getTime();
  if (end === undefined) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / MIN));
}

/** 干涸时浇水：本阶段时长 −dryWaterSub，低于种子原时长 × dryWaterMinRate 时不减 */
export function dryWaterMinutes(cur: number, orig: number, t: YardTuning): number {
  const next = cur - t.dryWaterSub;
  return next >= orig * t.dryWaterMinRate ? next : cur;
}

/** 施肥后本阶段是否还有剩余时间（规格书 08 §8.3） */
export function feedUseful(p: PlantState, plantTime: number): boolean {
  return p.stage >= 1 && p.stage <= 3 && stageMinutes(p) - p.feed_min - plantTime > 0;
}

/** 偷菜门槛：剩余产量 ≥ 种子原产量 × stealKeepRate（裁定 4，不含土地加成） */
export function canStealLeft(left: number, baseNum: number, t: YardTuning): boolean {
  return left >= baseNum * t.stealKeepRate;
}

/** 偷几个：7 级 1 个，其他 1~stealMax 个，不超过剩余 */
export function stealNum(seedLevel: number, left: number, rng: Rng, t: YardTuning): number {
  const n = seedLevel >= 7 ? 1 : rng.intMin1(t.stealMax);
  return Math.min(n, left);
}

/** 菜园动作收益系数（规格书 20 §20.7） */
export function actionRate(restLevel: number, own: boolean): number {
  return restLevel * 2 * (own ? 2 : 1) + 1;
}

const pad = (n: number) => String(n).padStart(2, '0');

function allowedMinutes(hour: number, e: EventTuning): readonly number[] {
  return hour >= e.dayFrom && hour < e.dayTo ? e.minutes : [e.nightMinute];
}

/** 最近一个已到的自然事件时点（裁定 11）：白天每小时 minutes 各一次，夜里只有 nightMinute */
export function yardPeriod(now: Date, e: EventTuning): string {
  const { day, hour, minute } = gameParts(now);
  const here = allowedMinutes(hour, e).filter((m) => m <= minute);
  if (here.length > 0) return `${day}@${pad(hour)}:${pad(Math.max(...here))}`;
  const prev = gameParts(new Date(now.getTime() - (minute + 1) * MIN));
  return `${prev.day}@${pad(prev.hour)}:${pad(Math.max(...allowedMinutes(prev.hour, e)))}`;
}

const KEYS: ReadonlyArray<keyof PlantState> = [
  'stage',
  'feed_min',
  'infancy',
  'maturity',
  'autumn',
  'harvest',
  'harvest_num',
  'worm',
  'grass',
  'dry',
];

/**
 * 一株作物的一次自然事件（规格书 08 §8.4、源码 plantTask，裁定 3）。
 * 每次固定先抽 6 个随机数（虫吃、草吃、长草、干涸加重、开始干涸、长虫），枯萎后不再往下判断（计划裁定 2）
 */
export function tickPlant(
  p: PlantState,
  raining: boolean,
  now: Date,
  rng: Rng,
  e: EventTuning,
): { next: PlantState; changed: boolean } {
  const r = Array.from({ length: 6 }, () => rng.next());
  const s: PlantState = { ...p };
  const done = () => ({
    next: s,
    changed: s.stage_at.getTime() !== p.stage_at.getTime() || KEYS.some((k) => s[k] !== p[k]),
  });
  const wither = () => {
    s.stage = 5;
    s.dry = 0;
    return done();
  };
  if (s.stage === 4 && s.stage_at.getTime() + s.harvest * MIN < now.getTime()) return wither();
  if ((s.worm > 0 && r[0]! < e.wormEatRate) || r[1]! < e.grassEatRate * s.grass) {
    s.harvest_num = Math.max(0, s.harvest_num - 1);
    if (s.harvest_num === 0) return wither();
  }
  if (!raining && s.dry >= e.dryDeath) return wither();
  if (r[2]! < e.grassRate * (raining ? 1 : e.grassDryFactor)) s.grass += 1;
  if (s.dry > 0 && r[3]! < e.dryAddRate) s.dry = raining ? 0 : s.dry + 1 + (s.grass > 0 ? 1 : 0);
  if (!raining && s.dry === 0 && r[4]! < e.dryStartRate + (s.grass > 0 ? e.dryStartGrassRate : 0)) s.dry = 1;
  if (s.worm === 0 && r[5]! < e.wormRate) s.worm = 1;
  if (raining && s.stage < 4 && s.worm === 0 && s.grass === 0 && canWater(s, now)) {
    s.stage += 1;
    s.stage_at = now;
    s.feed_min = 0;
  }
  return done();
}

/** 配方鉴定成功率（规格书 09 §9.3）：道具 formulaRate + 幸运率 × formulaAppraiseRatePerLuck + 星月密卷 */
export function formulaAppraiseRate(
  toolRate: number,
  luckRate: number,
  moonRate: number,
  t: YardTuning,
): number {
  return toolRate + luckRate * t.formulaAppraiseRatePerLuck + moonRate;
}

/** 鉴定成功后得主碎片还是辅碎片；有星月密卷且已有该配方辅碎片（或已学会）时辅碎片按 secToMain 转成主碎片 */
export function formulaPart(
  rng: Rng,
  moon: { secToMain: number } | null,
  hasSubOrLearned: boolean,
  t: YardTuning,
): { part: 'main' | 'sub'; upgraded: boolean } {
  if (rng.next() < t.formulaMainRate) return { part: 'main', upgraded: false };
  if (moon && hasSubOrLearned && rng.next() < moon.secToMain) return { part: 'main', upgraded: true };
  return { part: 'sub', upgraded: false };
}

/** 合成的额外产出：每份 rand < composeCritRate +1；rand < 幸运率/5 +1（计划裁定 13）；有星神之泪时 rand < tearRate +1 */
export function composeExtra(
  num: number,
  luckRate: number,
  tearRate: number | null,
  rng: Rng,
  t: YardTuning,
): number {
  let extra = 0;
  for (let i = 0; i < num; i++) {
    if (rng.next() < t.composeCritRate) extra += 1;
    if (rng.next() < luckRate / 5) extra += 1;
    if (tearRate !== null && rng.next() < tearRate) extra += 1;
  }
  return extra;
}

/** 种子商店单价（裁定 1，计划裁定 6） */
export function seedPrice(coin: number, t: YardTuning): number {
  return Math.ceil(coin * t.seedPriceRate);
}
