import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import {
  barHand,
  cupRound,
  cupWinRate,
  fgAwardLevel,
  fgOutcome,
  nextTimes,
  numHint,
  numMissValue,
  numWinRate,
  slotFloorLeft,
  slotFloorRate,
  slotForced,
} from './rules';

const t = testConfig().tuning.bar;

describe('划拳（设计文档 §3.2）', () => {
  it('幸运 0：< 0.25 胜、< 0.5 平、其余负', () => {
    expect(fgOutcome(0, 0, t)).toBe(1);
    expect(fgOutcome(0.2499, 0, t)).toBe(1);
    expect(fgOutcome(0.25, 0, t)).toBe(0);
    expect(fgOutcome(0.4999, 0, t)).toBe(0);
    expect(fgOutcome(0.5, 0, t)).toBe(-1);
  });

  it('幸运率只加在胜上（问题记录 419）：幸运率 0.1 时胜到 0.35、平到 0.6', () => {
    expect(fgOutcome(0.34, 0.1, t)).toBe(1);
    expect(fgOutcome(0.36, 0.1, t)).toBe(0);
    expect(fgOutcome(0.59, 0.1, t)).toBe(0);
    expect(fgOutcome(0.61, 0.1, t)).toBe(-1);
  });

  it('幸运率 0.3（约 300 幸运）仍会输：负 20%', () => {
    expect(fgOutcome(0.79, 0.3, t)).toBe(0);
    expect(fgOutcome(0.81, 0.3, t)).toBe(-1);
  });

  it('服务器出拳：胜 (h+1)%3、平 h、负 (h+2)%3', () => {
    expect([0, 1, 2].map((h) => barHand(h, 1))).toEqual([1, 2, 0]);
    expect([0, 1, 2].map((h) => barHand(h, 0))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((h) => barHand(h, -1))).toEqual([2, 0, 1]);
  });

  it('连续次数：和上一局相同 +1，否则 1；奖励等级 2 + ⌊连胜/3⌋', () => {
    expect(nextTimes(null, 0, 1)).toBe(1);
    expect(nextTimes(1, 4, 1)).toBe(5);
    expect(nextTimes(1, 4, 0)).toBe(1);
    expect(nextTimes(-1, 2, -1)).toBe(3);
    expect([1, 2, 3, 5, 6].map(fgAwardLevel)).toEqual([2, 2, 3, 3, 4]);
  });
});

describe('猜酒杯（设计文档 §3.3）', () => {
  it('第几连 = 上一局赢了 ? 上一局连胜 + 1 : 1；胜率 = (1 + 幸运率)/(n + 1)', () => {
    expect(cupRound(null, 0)).toBe(1);
    expect(cupRound(1, 3)).toBe(4);
    expect(cupRound(-1, 5)).toBe(1);
    expect(cupWinRate(1, 0)).toBe(0.5);
    expect(cupWinRate(3, 0.2)).toBeCloseTo(0.3, 10);
  });
});

describe('转数字（设计文档 §3.4）', () => {
  it('胜率 = 1/25 + 幸运率/20', () => {
    expect(numWinRate(0, t)).toBeCloseTo(0.04, 10);
    expect(numWinRate(0.2, t)).toBeCloseTo(0.05, 10);
  });

  it('没中时的数字：k 映射到 1~25 里除猜的数以外的 24 个数（计划裁定 3）', () => {
    expect(numMissValue(13, 0)).toBe(1);
    expect(numMissValue(13, 11)).toBe(12);
    expect(numMissValue(13, 12)).toBe(14);
    expect(numMissValue(1, 0)).toBe(2);
    expect(numMissValue(25, 23)).toBe(24);
    for (let num = 1; num <= 25; num++) {
      const vs = Array.from({ length: 24 }, (_, k) => numMissValue(num, k));
      expect(new Set(vs).size).toBe(24);
      for (const v of vs) {
        expect(v).not.toBe(num);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(25);
      }
    }
  });

  it('提示：差 < 3 差一丝丝、< 5 轻一点、其他力气太大', () => {
    expect(numHint(13, 15)).toBe('close');
    expect(numHint(13, 10)).toBe('soft');
    expect(numHint(13, 17)).toBe('soft');
    expect(numHint(13, 18)).toBe('hard');
  });
});

describe('老虎机（设计文档 §3.5）', () => {
  it('⌊fail/3⌋ ≥ 100 强制保底；提前保底率 = fail × 0.0000016，神灯翻倍；最多再抽几次必出', () => {
    expect(slotForced(299, t)).toBe(false);
    expect(slotForced(300, t)).toBe(true);
    expect(slotFloorRate(100, false, t)).toBeCloseTo(0.00016, 12);
    expect(slotFloorRate(100, true, t)).toBeCloseTo(0.00032, 12);
    // 最多再抽几次必出保底：第 300−fail 格（从 0 数）出保底，在第 ⌊(300−fail)/3⌋+1 次里（终审 Minor 2）
    expect(slotFloorLeft(0, t)).toBe(101);
    expect(slotFloorLeft(5, t)).toBe(99);
    expect(slotFloorLeft(297, t)).toBe(2);
    expect(slotFloorLeft(298, t)).toBe(1);
    expect(slotFloorLeft(299, t)).toBe(1);
    expect(slotFloorLeft(300, t)).toBe(1);
  });
});
