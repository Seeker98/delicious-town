import type { Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';

export type BarTuning = Tuning['bar'];
/** 1 胜 / 0 平 / -1 负（bar_state 的 *_result 列） */
export type BarResult = 1 | 0 | -1;

/**
 * 划拳：先判胜、再判平（规格书 10 §10.1）。偏离规格（问题记录 419）：幸运率只加在胜上，
 * 且胜最多到 1 − 平 − fgLoseMin；原来胜、平各加一份，约 200 幸运以后就不会输
 */
export function fgOutcome(r: number, luckRate: number, t: BarTuning): BarResult {
  const win = Math.min(t.fgWinRate + luckRate, 1 - t.fgDrawRate - t.fgLoseMin);
  if (r < win) return 1;
  if (r < win + t.fgDrawRate) return 0;
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

/**
 * 最多再抽几次必出保底：没出稀有时，从现在数第 (总格数 − fail) 格（从 0 数）被强制保底，
 * 落在第 ⌊(总格数 − fail) / 每次格数⌋ + 1 次里（终审 Minor 2：设计文档的 100 − ⌊fail/3⌋ 会少算 1 次）
 */
export function slotFloorLeft(fail: number, t: BarTuning): number {
  const total = t.slotFloorSpins * t.slotCells;
  return Math.floor((total - Math.min(fail, total)) / t.slotCells) + 1;
}

// ---------- 酒吧扩展（子项目 4C-3） ----------

/** 魔鬼辣杯赔付：押注 × rate^活过的杯数，四舍五入（终审：向下取整时押 1 张活过 1、2 杯都只拿回本金） */
export function devilPayout(stake: number, survived: number, rate: number): number {
  return Math.round(stake * rate ** survived);
}

/** 飞镖准星位置：三角波，周期 period（毫秒），起点相位 phase ∈ [0,1)；返回 [-1, 1] */
export function dartX(elapsedMs: number, period: number, phase: number): number {
  const p = (((elapsedMs / period + phase) % 1) + 1) % 1;
  return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
}

/** 按离靶心的距离给分；rings 按半径从小到大 */
export function dartScore(x: number, rings: ReadonlyArray<readonly [number, number]>): number {
  const d = Math.abs(x);
  for (const [r, s] of rings) if (d <= r + 1e-9) return s;
  return 0;
}

/** 记忆调酒的展示总时长和作答窗口 [最早, 最晚]（相对发出配方的时刻，毫秒） */
export function memoryWindow(
  len: number,
  m: BarTuning['memory'],
): { showMs: number; earliest: number; latest: number } {
  const showMs = len * m.flashMs + (len - 1) * m.gapMs;
  return { showMs, earliest: showMs - m.earlyMs, latest: showMs + m.answerBaseMs + len * m.answerPerItemMs };
}

/**
 * 最后一颗糖的调酒师（设计 §4.2）：剩余 mod (k+1) 不为 0 时拿余数，让剩下的是 k+1 的倍数；
 * 新手桌有 mistake 的概率失手；必输局面在 1~min(k, 剩余) 里随便拿
 */
export function nimBartenderTake(left: number, k: number, mistake: number, rng: Rng): number {
  const r = left % (k + 1);
  if (r !== 0 && !rng.chance(mistake)) return r;
  return 1 + rng.int(Math.min(k, left));
}
