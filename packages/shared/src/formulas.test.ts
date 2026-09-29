import { describe, expect, it } from 'vitest';
import { levelUpExp, luckRate } from './formulas';

describe('luckRate（规格书 00 §0.5）', () => {
  it('规格书示例', () => {
    expect(luckRate(0)).toBe(0);
    expect(luckRate(100)).toBeCloseTo(0.1732, 4);
    expect(luckRate(300)).toBeCloseTo(0.3, 10);
    expect(luckRate(700)).toBeCloseTo(0.4, 10);
    expect(luckRate(-100)).toBeCloseTo(-0.1732, 4);
  });
});

describe('levelUpExp（规格书 02 §2.2）', () => {
  it('规格书示例', () => {
    expect(levelUpExp(1)).toBe(500);
    expect(levelUpExp(10)).toBe(50_000);
    expect(levelUpExp(50)).toBe(1_250_000);
    expect(levelUpExp(99)).toBe(4_900_500);
    expect(levelUpExp(100)).toBe(15_000_000);
  });

  it('114 级以上增速更快', () => {
    const d114 = levelUpExp(115) - levelUpExp(114);
    const d113 = levelUpExp(114) - levelUpExp(113);
    expect(d114).toBeGreaterThan(d113);
  });
});
