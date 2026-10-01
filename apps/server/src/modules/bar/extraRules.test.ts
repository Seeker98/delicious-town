import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { dartScore, dartX, devilPayout, memoryWindow } from './rules';

describe('酒吧扩展规则（4C-3）', () => {
  it('魔鬼辣杯赔付四舍五入（终审：押 1 张时向下取整，活过 1、2 杯都只拿回本金）', () => {
    expect(devilPayout(10, 1, 1.4)).toBe(14);
    expect(devilPayout(10, 2, 1.4)).toBe(20);
    expect(devilPayout(10, 3, 1.4)).toBe(27);
    expect(devilPayout(1, 1, 1.4)).toBe(1);
    expect(devilPayout(1, 2, 1.4)).toBe(2);
    expect(devilPayout(1, 3, 1.4)).toBe(3);
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
