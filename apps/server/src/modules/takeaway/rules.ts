import type { Tuning } from '@dt/config';
import { gameParts, type Rng } from '@dt/shared';

export type TakeawayTuning = Tuning['takeaway'];

/** 浮点取整：先加一点点，避免 197.99999 取成 197 */
export const fl = (x: number): number => Math.floor(x + 1e-9);

/** 配送失败的原因（原版 takeawayDeliveryFailRessonList） */
export const FAIL_REASONS: readonly string[] = [
  '遇到了大堵车!',
  '前轮爆胎了!',
  '前女友挡在路中间!',
  '电瓶车没电了!',
  '摔了一跤!',
  '接单太多了!',
  '顾客不满意!',
  '顾客退单了!',
];

/** 单品级：按 gradeRates 累加，r ∈ [0,1) */
export function pickGrade(r: number, t: TakeawayTuning): number {
  let acc = 0;
  for (let i = 0; i < t.gradeRates.length; i++) {
    acc += t.gradeRates[i]!;
    if (r < acc) return i + 1;
  }
  return t.gradeRates.length;
}

export interface RolledOrder {
  cookbookId: number;
  grade: number;
  needMinutes: number;
  needRenown: number;
  /** 从生成时起的有效分钟数 */
  expireMinutes: number;
}

/** 一张单（设计文档 §3.2）：随机数顺序 食谱 → 品级 → 时长 → 有效期 → 声望 */
export function rollOrder(rng: Rng, cookbookIds: readonly number[], t: TakeawayTuning): RolledOrder {
  const cookbookId = cookbookIds[rng.int(cookbookIds.length)]!;
  const grade = pickGrade(rng.next(), t);
  const needMinutes = t.minutesBase + rng.int(t.minutesPerGrade * grade);
  const expireMinutes = needMinutes + rng.int(t.minutesPerGrade * grade);
  const needRenown = t.renownPerGrade * grade + rng.intMin1(grade);
  return { cookbookId, grade, needMinutes, needRenown, expireMinutes };
}

/** 公共单目标数；roll = rng.int(publicRand) */
export function publicTarget(openNum: number, roll: number, t: TakeawayTuning): number {
  const n = openNum < t.publicMinOpen ? t.publicOpenFloor : openNum;
  return roll + t.publicBase + Math.floor(n / t.publicPerOpen);
}

export interface RiderAttrs {
  /** 减时 % */
  timeSub: number;
  /** 经验加成 % */
  expAdd: number;
  /** 银币加成 % */
  coinAdd: number;
  /** 声望加成 % */
  renownAdd: number;
  /** 成功率 ‰ */
  odds: number;
  /** 同时配送数 */
  maxNum: number;
  /** 升到下一级所需经验 */
  needExp: number;
}

/** 骑手属性（设计文档 §3.5，规格书 20.12） */
export function riderAttrs(level: number, t: TakeawayTuning): RiderAttrs {
  const r = t.rider;
  const n = level - 1;
  return {
    timeSub: Math.min(r.timeSubMax, n),
    expAdd: r.expAdd * n,
    coinAdd: r.coinAdd * n,
    renownAdd: Math.floor(n / r.renownEvery),
    odds: Math.min(r.oddsMax, r.oddsBase + r.oddsPerLevel * n),
    maxNum: 1 + Math.floor(level / r.maxNumEvery),
    needExp: level * level * r.expPerLevel2 + r.expBase,
  };
}

/** 骑手加经验并升级：可连升；到最高级后经验不再增加 */
export function addRiderExp(
  level: number,
  exp: number,
  add: number,
  t: TakeawayTuning,
): { level: number; exp: number; gained: number } {
  const max = t.rider.maxLevel;
  if (level >= max) return { level, exp, gained: 0 };
  let l = level;
  let e = exp + add;
  while (l < max && e >= riderAttrs(l, t).needExp) {
    e -= riderAttrs(l, t).needExp;
    l += 1;
  }
  if (l >= max) e = 0;
  return { level: l, exp: e, gained: l - level };
}

/** 自己的骑手从 from 级升到 to 级后的可雇上限 */
export function riderCapAfter(cap: number, from: number, to: number, t: TakeawayTuning): number {
  return cap + t.rider.capLevels.filter((x) => x > from && x <= to).length;
}

/** 几份加成按键相加（天气 + 餐厅加成汇总） */
export function sumBonus(...parts: Array<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export interface ValueInput {
  /** 食谱售价 */
  price: number;
  /** 单品级 */
  grade: number;
  /** 我这道菜的品级 */
  myGrade: number;
  /** 餐厅等级 */
  level: number;
  needMinutes: number;
  rider: RiderAttrs;
  /** 天气 + 餐厅加成（ta* 键） */
  bonus: Record<string, number>;
  /** 骑手的幸运率 */
  luckRate: number;
  /** rng.int(successFloat) */
  floatRoll: number;
}

export interface OrderValues {
  minutes: number;
  coin: number;
  exp: number;
  renown: number;
  /** 成功率 ‰ */
  odds: number;
}

/** 接单时定下的数值（设计文档 §3.3） */
export function orderValues(v: ValueInput, t: TakeawayTuning): OrderValues {
  const hi = v.price > t.priceLine ? 1 : 0;
  const base = v.price * v.grade * (1 + v.myGrade / 10);
  const b = (k: string) => v.bonus[k] ?? 0;
  return {
    minutes: Math.max(1, fl(v.needMinutes * (1 - v.rider.timeSub / 100 + b('taNeedtimeRate')))),
    coin: fl(t.coinRates[hi] * base * (1 + v.rider.coinAdd / 100 + b('taCoinRate'))),
    exp: fl(((t.expRates[hi] * base) / t.expDiv) * v.level * (1 + v.rider.expAdd / 100 + b('taExpRate'))),
    renown: fl(v.grade * (1 + v.rider.renownAdd / 100 + b('taRenownRate'))),
    odds:
      t.successFloat / 2 -
      v.floatRoll +
      v.rider.odds +
      Math.round(b('taSuccessoddsRate') * 1000) +
      fl(v.luckRate * t.luckOddsRate),
  };
}

/** 奖池权重（设计文档 §3.6）：[道具 id, 权重] */
export function awardWeights(grade: number, t: TakeawayTuning): Array<[number, number]> {
  return t.awards.map(([id, w, bonus]) => [id, w * (1 + bonus * (grade - 1))]);
}

/** 按权重抽一件，r ∈ [0,1) */
export function pickAward(r: number, grade: number, t: TakeawayTuning): number {
  const list = awardWeights(grade, t);
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [id, w] of list) {
    if (x < w) return id;
    x -= w;
  }
  return list[list.length - 1]![0];
}

/** 领取时的经验（设计文档 §3.4）：加料 ×2、好友骑手 ×0.9，再私人单 ×1.5 */
export function claimExp(
  exp: number,
  f: { double: boolean; friend: boolean; private: boolean },
  t: TakeawayTuning,
): number {
  const a = fl(exp * (f.double ? 2 : 1) * (f.friend ? t.friendRiderRate : 1));
  return f.private ? fl(a * t.privateExpRate) : a;
}

/** 骑手经验（规格书 14.4） */
export function riderExpGain(v: {
  grade: number;
  fail: boolean;
  drone: boolean;
  kinds: number;
  rate: number;
}): number {
  return fl(
    Math.sqrt(v.grade * 10) * 2 * (v.fail ? 2 : 1) * (v.drone ? 2 : 1) * (v.kinds + 1) * (1 + v.rate),
  );
}

export function droneDiamonds(grade: number): number {
  return grade * 2 + 1;
}

export function customerRate(luckRate: number, t: TakeawayTuning): number {
  return t.customer.base + luckRate / t.customer.luckDiv;
}

/** 补单任务的周期：游戏时间的整点 */
export function takeawayPeriod(now: Date): string {
  const p = gameParts(now);
  return `${p.day} ${String(p.hour).padStart(2, '0')}`;
}
