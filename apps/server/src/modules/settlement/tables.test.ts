import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { normalDishCoin, splitLearned } from './tables';

describe('splitLearned：按存储位找出学会的菜（重新编号 PR 3）', () => {
  // 存储位 0 → 菜 5（1 号街），1 是空位（删掉的菜），2 → 菜 7（2 号街）；菜 6 已删（街道 -1）
  const idx = {
    idAt: Int32Array.from([5, -1, 7]),
    street: Int16Array.from([-1, -1, -1, -1, -1, 1, -1, 2]),
  };

  it('空位上的字节、超出存储位总数的字节都不算（换号后老店的字节串可能更长）', () => {
    const levels = Uint8Array.from([3, 2, 1, 4, 5]);
    expect(splitLearned(levels, idx, 1)).toEqual({ all: [5, 7], local: [5], other: [7] });
  });

  it('字节串比存储位短时只看有的部分', () => {
    expect(splitLearned(Uint8Array.from([1]), idx, 2)).toEqual({ all: [5], local: [], other: [5] });
  });
});

describe('normalDishCoin：普通顾客按本街菜价付（收益模型改版 2026-10-15）', () => {
  const ids = [11, 12, 13, 14];
  const prices: Record<number, number> = { 11: 500, 12: 3000, 13: 360, 14: 800 };
  const p = { base: 12, rate: 0.04, gradeAdd: 0.2, cap: 64 };
  const pay = (learned: number[], r: number) =>
    normalDishCoin(ids, new Set(learned), (id) => prices[id]!, p, sequenceRng([r]));

  it('点到学会的菜：菜价 × 4% × 1.2', () => {
    expect(pay([11], 0)).toBeCloseTo(500 * 0.048);
  });
  it('不超过上限 64，不低于基础价', () => {
    expect(pay([12], 0.3)).toBe(64);
    expect(pay([13], 0.6)).toBeCloseTo(360 * 0.048);
    expect(normalDishCoin([13], new Set([13]), () => 100, p, sequenceRng([0]))).toBe(12);
  });
  it('点到没学会的菜付基础价', () => {
    expect(pay([11], 0.9)).toBe(12);
  });
  it('本街一道都没学会、或本街没有菜时付基础价，不取随机数', () => {
    let used = 0;
    const rng = { ...sequenceRng([0]), int: () => (used++, 0) };
    expect(normalDishCoin(ids, new Set(), (id) => prices[id]!, p, rng)).toBe(12);
    expect(normalDishCoin([], new Set([11]), (id) => prices[id]!, p, rng)).toBe(12);
    expect(used).toBe(0);
  });
});
