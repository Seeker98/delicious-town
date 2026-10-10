import type { Tuning } from '@dt/config';
import { addDays, buildPool, gameTime, pickWeighted, type Rng } from '@dt/shared';

export type WishTuning = Tuning['wishTree'];

/** 开一轮时树上结的道具：按权重抽一项（许愿树设计 §1.1） */
export function pickPrize(prizes: WishTuning['prizes'], rng: Rng): { goods: number; num: number } {
  const p = pickWeighted(
    buildPool(prizes, (x) => x.weight),
    rng,
  );
  return { goods: p.goods, num: p.num };
}

/** 许愿的店里等概率抽 1 家；先按编号排序，结果只取决于随机数 */
export function pickWinner(restIds: readonly number[], rng: Rng): number | null {
  if (restIds.length === 0) return null;
  const sorted = [...restIds].sort((a, b) => a - b);
  return sorted[rng.int(sorted.length)]!;
}

/** 一轮从游戏日 day 的 hour 点到下一天的同一时刻 */
export function roundWindow(day: string, hour: number): { opensAt: Date; endsAt: Date } {
  return { opensAt: gameTime(day, hour), endsAt: gameTime(addDays(day, 1), hour) };
}
