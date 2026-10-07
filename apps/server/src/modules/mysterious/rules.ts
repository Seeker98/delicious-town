import type { AppraiseDef, McProficiency, MysteriousCookbook, Tuning } from '@dt/config';
import { pickWeighted, type Rng, type WeightedPool } from '@dt/shared';

export type McTuning = Tuning['mysterious'];

/** 用残卷学会要 3 张（规格书 04 §4.4） */
export const LEARN_REMNANTS = 3;

/** 品级：bounds 是品级 2~7 的下限，落在第几段就是几品（设计文档 裁定 16） */
export function gradeOf(rate: number, bounds: readonly number[]): number {
  let g = 1;
  for (const b of bounds) if (rate >= b) g += 1;
  return g;
}

/** 道份数加成（规格书 20 §20.4）：others 是除本道菜以外已学的特色菜 */
export function roadRate(road: number, others: readonly MysteriousCookbook[], t: McTuning): number {
  let same = 0;
  let other = 0;
  for (const m of others) {
    if (m.road === road) same += 1;
    else other += 1;
  }
  return Math.min(same * t.roadSame, t.roadSameMax) + Math.min(other * t.roadOther, t.roadOtherMax);
}

export interface CookInput {
  mc: MysteriousCookbook;
  cookNum: number;
  curlevel: number;
  trialWorth: number;
  star: number;
  luckRate: number;
  /** 加成 + 天气的 mcGoldRate */
  goldRate: number;
  /** 加成 + 天气的 mcNumRate */
  numRate: number;
  roadRate: number;
  /** 厨力 */
  power: number;
  /** 集名画的 mcCoinAdd */
  coinAdd: number;
  humanSon: boolean;
  cookie: boolean;
}

export interface CookOutcome {
  grade: number;
  /** 加成把品级抬高了（设计文档 裁定 17） */
  luck: boolean;
  num: number;
  /** 每份价值 */
  price: number;
  /** 对决用的每份价值：不含试炼价值（用户 2026-10-07 定） */
  duelPrice: number;
  /** 本次增加的熟练度 */
  exp: number;
}

/** 烹制（规格书 04 §4.5） */
export function cookDish(i: CookInput, t: McTuning, rng: Rng): CookOutcome {
  const levelRate = (i.curlevel - 1) * t.levelBonusPerLevel;
  const r0 = rng.next();
  const grade = gradeOf(r0 + i.luckRate / 8 + levelRate + i.goldRate, t.gradeBounds);
  const luck = gradeOf(r0, t.gradeBounds) < grade;
  const [lo, hi] = t.highLevelNumRange;
  const base = t.baseNum * i.cookNum * (i.mc.level > t.highLevel ? lo + rng.next() * (hi - lo) : 1);
  const [a, b] = t.gradeRatio[grade - 1]!;
  const ratio = 1 + a + rng.next() * (b - a) + i.luckRate / 8;
  const cookNumRate = (Math.sqrt(Math.max(0, i.power) * 2) / t.cookNumPowerDiv) * rng.next();
  const num = Math.floor(base * ratio * (1 + i.roadRate + i.numRate + cookNumRate));
  const halfStar = Math.floor(i.star / 2);
  const son = i.humanSon ? rng.intMin1(Math.max(1, 4 - halfStar)) : 0;
  const cookie = i.cookie ? rng.intMin1(Math.max(1, 5 - halfStar)) : 0;
  const flat = son + Math.floor(i.coinAdd) + cookie;
  const price = Math.floor(i.mc.nutritive * ratio * (1 + levelRate + i.trialWorth / 100)) + flat;
  // 对决不吃试炼价值（用户 2026-10-07 定）
  const duelPrice = Math.floor(i.mc.nutritive * ratio * (1 + levelRate)) + flat;
  return { grade, luck, num, price, duelPrice, exp: Math.floor((grade * num) / 200) };
}

/** 熟练度：curexp 为累计值，达到本级 expNext 升级（计划裁定 5） */
export function addProficiency(
  curlevel: number,
  curexp: number,
  add: number,
  table: readonly McProficiency[],
): { curlevel: number; curexp: number } {
  const exp = curexp + add;
  let lv = curlevel;
  for (;;) {
    const row = table[lv - 1];
    if (!row || row.expNext === null || exp < row.expNext) break;
    lv += 1;
  }
  return { curlevel: lv, curexp: exp };
}

/** 海绵宝宝点赞（BOB）概率 */
export function bobChance(mc: MysteriousCookbook, cookNum: number, t: McTuning): number {
  return mc.level > t.highLevel ? 1 : t.bobRatePerNutritive * mc.nutritive * cookNum;
}

/** 试炼经验带来的餐厅经验 */
export function trialRestExp(num: number, restLevel: number, trialExp: number): number {
  return Math.floor((num * restLevel * trialExp) / 1200);
}

/** 鉴定成功率；bonus = 天气 + 加成的 starMCBookRate */
export function appraiseRate(def: AppraiseDef, bonus: number, luckRate: number): number {
  return def.rate + bonus + luckRate / 8;
}

/** 按 odds 抽一道；retry（有星神之书且没勾"不重抽"）时低于 appraiseRetryBelow 级再抽一次取高的 */
export function appraisePick(
  pool: WeightedPool<MysteriousCookbook>,
  retry: boolean,
  t: McTuning,
  rng: Rng,
): { mc: MysteriousCookbook; blessed: boolean } {
  const first = pickWeighted(pool, rng);
  if (!retry || first.level >= t.appraiseRetryBelow) return { mc: first, blessed: false };
  const second = pickWeighted(pool, rng);
  return second.level > first.level ? { mc: second, blessed: true } : { mc: first, blessed: false };
}

export function learnRate(thinker: boolean, luckRate: number, t: McTuning): number {
  return (thinker ? 1 : t.lessonLearnRate) + luckRate / 5;
}

export function stealRate(level: number, thinker: boolean, luckRate: number, t: McTuning): number {
  return (
    t.lessonStealRate - level * t.lessonStealPerLevel + (thinker ? t.thinkerStealBonus : 0) + luckRate / 5
  );
}

export function forgetCount(level: number, t: McTuning): number {
  return level * t.forgetPerLevel + 1;
}

export function forgetMcChance(level: number, t: McTuning): number {
  return level >= t.forgetMcFromLevel ? level * t.forgetMcPerLevel : 0;
}

/** 开课的星级门槛 */
export function teacherStar(level: number): number {
  return Math.max(1, Math.floor((level - 1) / 2));
}

/** 学课的星级门槛 */
export function studentStar(level: number): number {
  return Math.floor((level - 1) / 2) + 1;
}

export function tasteStrength(price: number, friend: boolean): number {
  return Math.floor(price / (friend ? 1 : 2));
}

export function tasteRecipeRate(grade: number, luckRate: number, t: McTuning): number {
  return t.tasteMcRate * (1 + grade * t.tasteGradeFactor) + luckRate / 100;
}

/** 店主得到的神秘礼券 */
export function tasteTickets(strength: number, ownerStar: number, rng: Rng): number {
  return rng.intMin1(Math.floor(strength / (10 * (ownerStar === 0 ? 2 : 1))) + 1);
}

/** 不放回地随机取 n 个（不够时全取） */
export function pickSome<T>(items: readonly T[], n: number, rng: Rng): T[] {
  const arr = [...items];
  const k = Math.min(n, arr.length);
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(arr.length - i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.slice(0, k);
}
