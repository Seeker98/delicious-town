import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { dartScore, dartX, devilPayout, memoryWindow } from './rules';

describe('酒吧扩展规则（4C-3）', () => {
  it('魔鬼辣杯按赔付表赔（2026-10-09：押 1 是 1/2/3，其余 1.35 倍取整）；不在表里的押注、杯数赔 0', () => {
    const d = testConfig().tuning.bar.devil;
    expect([1, 2, 3].map((k) => devilPayout(d, 1, k))).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((k) => devilPayout(d, 10, k))).toEqual([14, 18, 25]);
    expect([1, 2, 3].map((k) => devilPayout(d, 20, k))).toEqual([27, 36, 49]);
    expect(devilPayout(d, 3, 1)).toBe(0);
    expect(devilPayout(d, 10, 4)).toBe(0);
  });
  it('飞镖三角波：相位 0 从 -1 出发，半周期到 1，一周期回到 -1', () => {
    expect(dartX(0, 1000, 0)).toBeCloseTo(-1);
    expect(dartX(250, 1000, 0)).toBeCloseTo(0);
    expect(dartX(500, 1000, 0)).toBeCloseTo(1);
    expect(dartX(750, 1000, 0)).toBeCloseTo(0);
    expect(dartX(1000, 1000, 0)).toBeCloseTo(-1);
    expect(dartX(0, 1000, 0.25)).toBeCloseTo(0);
  });
  it('飞镖得分环', () => {
    const rings = [
      [0.05, 50],
      [0.15, 25],
      [0.3, 10],
      [0.5, 5],
    ] as const;
    expect(dartScore(0, rings)).toBe(50);
    expect(dartScore(-0.05, rings)).toBe(50);
    expect(dartScore(0.1, rings)).toBe(25);
    expect(dartScore(0.3, rings)).toBe(10);
    expect(dartScore(-0.45, rings)).toBe(5);
    expect(dartScore(0.9, rings)).toBe(0);
  });
  it('记忆调酒时间窗：3 种 = 3×600 + 2×200 = 2200ms 展示', () => {
    const m = testConfig().tuning.bar.memory;
    expect(memoryWindow(3, m)).toEqual({ showMs: 2200, earliest: 1900, latest: 2200 + 3000 + 4500 });
  });
});
