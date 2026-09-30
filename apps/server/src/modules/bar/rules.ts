import type { Tuning } from '@dt/config';

export type BarTuning = Tuning['bar'];
/** 1 胜 / 0 平 / -1 负（bar_state 的 *_result 列） */
export type BarResult = 1 | 0 | -1;

/** 划拳：先判胜、再判平（规格书 10 §10.1） */
export function fgOutcome(r: number, luckRate: number, t: BarTuning): BarResult {
  const win = t.fgWinRate + luckRate;
  if (r < win) return 1;
  if (r < win + t.fgDrawRate + luckRate) return 0;
  return -1;
}

/** 服务器出拳（0 石头、1 剪刀、2 布）：胜 (h+1)%3，平 h，负 (h+2)%3 */
export function barHand(hand: number, result: BarResult): number {
  return result === 1 ? (hand + 1) % 3 : result === 0 ? hand : (hand + 2) % 3;
}

/** 连续次数：和上一局结果相同 +1，否则 1 */
export function nextTimes(prev: BarResult | null, prevTimes: number, result: BarResult): number {
  return prev === result ? prevTimes + 1 : 1;
}

/** 划拳胜利的奖励等级 = 2 + ⌊连胜 / 3⌋ */
export function fgAwardLevel(times: number): number {
  return 2 + Math.floor(times / 3);
}

/** 猜酒杯这一局是第几连（也是要花的礼券数）：上一局赢了是上一局连胜 + 1，否则 1 */
export function cupRound(prev: BarResult | null, prevTimes: number): number {
  return prev === 1 ? prevTimes + 1 : 1;
}

/** 猜酒杯胜率 = (1 + 幸运率) / (n + 1) */
export function cupWinRate(n: number, luckRate: number): number {
  return (1 + luckRate) / (n + 1);
}

/** 转数字胜率 = 1/numMax + 幸运率/numLuckDiv */
export function numWinRate(luckRate: number, t: BarTuning): number {
  return 1 / t.numMax + luckRate / t.numLuckDiv;
}

/** 没中时转到的数字：k ∈ [0, numMax−1) 映射到 1~numMax 里除 num 以外的数（计划裁定 3） */
export function numMissValue(num: number, k: number): number {
  const v = k + 1;
  return v >= num ? v + 1 : v;
}

export type NumHint = 'close' | 'soft' | 'hard';

/** 差 < 3 "差一丝丝"、< 5 "轻一点"、其他"力气太大" */
export function numHint(num: number, barNum: number): NumHint {
  const d = Math.abs(num - barNum);
  return d < 3 ? 'close' : d < 5 ? 'soft' : 'hard';
}

/** 连续没出稀有的格数达到 slotFloorSpins 次（每次 slotCells 格）时强制保底 */
export function slotForced(fail: number, t: BarTuning): boolean {
  return Math.floor(fail / t.slotCells) >= t.slotFloorSpins;
}

/** 提前保底率 = fail × slotFloorRate × (神灯 ? 2 : 1) */
export function slotFloorRate(fail: number, lamp: boolean, t: BarTuning): number {
  return fail * t.slotFloorRate * (lamp ? 2 : 1);
}

/** 距离强制保底还剩几次 */
export function slotFloorLeft(fail: number, t: BarTuning): number {
  return Math.max(0, t.slotFloorSpins - Math.floor(fail / t.slotCells));
}
