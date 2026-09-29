import { levelUpExp } from '@dt/shared';

export interface ExpResult {
  level: number;
  exp: number;
  gained: number;
}

/** 经验入账，可以连升多级（规格书 02 §2.2）。exp 是当前等级内的经验 */
export function applyExp(level: number, exp: number, gain: number): ExpResult {
  let l = level;
  let e = exp + gain;
  let gained = 0;
  while (gained < 1000 && e >= levelUpExp(l)) {
    e -= levelUpExp(l);
    l += 1;
    gained += 1;
  }
  return { level: l, exp: e, gained };
}
