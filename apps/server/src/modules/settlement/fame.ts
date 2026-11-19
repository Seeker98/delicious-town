import type { CookbookIndex, Tuning } from '@dt/config';

/**
 * 厨艺钱（收益模型改版 2026-11-19）：F = a × K^β × 星级客单价系数。
 * 星级客单价系数 = (starBase + starPerStar × 星级) ÷ starDivisor，默认 0 星 0.36、4 星 0.76、7 星 1.06。
 * K ≤ 0（一道菜都没学）时为 0
 */
export function fameCoin(k: number, star: number, f: Tuning['settlement']['fame']): number {
  if (k <= 0) return 0;
  return f.a * Math.pow(k, f.beta) * starFameRate(star, f);
}

/** 星级客单价系数 */
export function starFameRate(star: number, f: Tuning['settlement']['fame']): number {
  return (f.starBase + f.starPerStar * star) / f.starDivisor;
}

/** 一道菜给的厨艺值：菜价 × (1 + 品级加成)；品级 0（没学）为 0 */
export function dishFame(price: number, grade: number, gradeAdd: (g: number) => number): number {
  return grade > 0 ? price * (1 + gradeAdd(grade)) : 0;
}

/** 厨艺值 K（食谱页、搬家页用；结算在 splitLearned 的同一遍里累加） */
export function fameValue(
  levels: Uint8Array,
  idx: Pick<CookbookIndex, 'idAt' | 'street' | 'coin'>,
  gradeAdd: (g: number) => number,
): number {
  let k = 0;
  const n = Math.min(levels.length, idx.idAt.length);
  for (let s = 0; s < n; s++) {
    const grade = levels[s]!;
    if (grade === 0) continue;
    const id = idx.idAt[s]!;
    if (id < 0 || idx.street[id]! < 0) continue;
    k += dishFame(idx.coin[id]!, grade, gradeAdd);
  }
  return k;
}

/** 满意的机会：品级 ≥ 要求的菜有 m 道时 min(1, m ÷ satisfyCount) */
export function satisfyChance(m: number, satisfyCount: number): number {
  return Math.min(1, m / satisfyCount);
}

/**
 * 银币率里“本街学菜”一项（收益模型改版 2026-11-19，和结算 settlement/rates.ts 同一个算法）：
 * 这条街学会的道数 ÷ 这条街的菜数 × streetLearnCoinRate，学满封顶；没菜的街为 0
 */
export function streetLearnRate(learned: number, streetTotal: number, rate: number): number {
  return streetTotal > 0 ? Math.round(rate * Math.min(1, learned / streetTotal) * 1e9) / 1e9 : 0;
}
