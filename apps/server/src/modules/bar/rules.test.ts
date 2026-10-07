import { describe, expect, it } from 'vitest';
import { seededRng, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  barHand,
  cupWinRate,
  fgAwardLevel,
  fgOutcome,
  nimBartenderTake,
  dealOffer,
  spiceScore,
  spiceTier,
  nextTimes,
  numHint,
  numMissValue,
  numWinRate,
  slotFloorLeft,
  slotFloorRate,
  slotForced,
  slotRareEvery,
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

  it('幸运再高也至少有 fgLoseMin 的概率输：胜最多到 1 - 平 - fgLoseMin', () => {
    expect(t.fgLoseMin).toBe(0.1);
    expect(fgOutcome(0.64, 0.6, t)).toBe(1);
    expect(fgOutcome(0.66, 0.6, t)).toBe(0);
    expect(fgOutcome(0.89, 0.6, t)).toBe(0);
    expect(fgOutcome(0.91, 0.6, t)).toBe(-1);
    expect(fgOutcome(0.91, 5, t)).toBe(-1);
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

describe('猜酒杯（问题记录 427-5）', () => {
  it('猜中率 = (1 + 幸运率) / 杯子数，最高 maxRate', () => {
    expect(cupWinRate(2, 0, 0.95)).toBe(0.5);
    expect(cupWinRate(7, 0.4, 0.95)).toBeCloseTo(0.2, 10);
    expect(cupWinRate(2, 1, 0.95)).toBe(0.95);
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

  it('算上保底平均每几次出一次稀有（问题记录 511：奖池表只写了单格概率）', () => {
    // 每次 1 格、第 3 格必出、不提前保底、单格一半稀有：1 + 0.5 + 0.25 = 1.75 格
    const toy = { ...t, slotCells: 1, slotFloorSpins: 2, slotFloorRate: 0 };
    const awards = [
      { odds: 1, rare: true },
      { odds: 1, rare: false },
    ];
    expect(slotRareEvery(awards, toy, false)).toBeCloseTo(1.75, 12);
    // 提前保底率 0.5 × fail：走到第 2 格的概率 0.5，它提前出保底 0.5、按权重出稀有 0.5 × 0.5，
    // 走到第 3 格的概率 0.5 × 0.5 × 0.5 = 0.125 → 1 + 0.5 + 0.125
    expect(slotRareEvery(awards, { ...toy, slotFloorRate: 0.5 }, false)).toBeCloseTo(1.625, 12);
    // 神灯让提前保底翻倍：第 2 格必出 → 1 + 0.5
    expect(slotRareEvery(awards, { ...toy, slotFloorRate: 0.5 }, true)).toBeCloseTo(1.5, 12);
    // 现在的数值：单格 0.06% 的稀有，算上 100 次的保底大约每 90 次出一次（核对工具实测每格约 0.37%）
    const real = slotRareEvery(testConfig().bundle.slotAwards, t, false);
    expect(real).toBeGreaterThan(85);
    expect(real).toBeLessThan(101);
    expect(slotRareEvery(testConfig().bundle.slotAwards, t, true)).toBeLessThan(real);
  });
});

describe('最后一颗糖的调酒师（设计 §4.2）', () => {
  it('占优、不失手：拿余数，让剩下的是 k+1 的倍数', () => {
    expect(nimBartenderTake(10, 3, 0, sequenceRng([0.9]))).toBe(2);
    expect(nimBartenderTake(7, 3, 0, sequenceRng([0.9]))).toBe(3);
    // 剩 2 颗、k=3：余数就是 2，一把拿完
    expect(nimBartenderTake(2, 3, 0, sequenceRng([0.9]))).toBe(2);
  });

  it('新手桌占优时按失手概率：没失手拿余数，失手在 1~min(k, 剩余) 里随便拿', () => {
    expect(nimBartenderTake(10, 3, 0.5, sequenceRng([0.6]))).toBe(2);
    // 0.4 < 0.5 失手；再抽 int(3)，0 → 拿 1
    expect(nimBartenderTake(10, 3, 0.5, sequenceRng([0.4, 0]))).toBe(1);
  });

  it('必输局面在 1~min(k, 剩余) 里随便拿', () => {
    // 8 mod 4 = 0：不抽失手，直接 int(3)：0.99 → 2，拿 3；0 → 拿 1
    expect(nimBartenderTake(8, 3, 0, sequenceRng([0.99]))).toBe(3);
    expect(nimBartenderTake(8, 3, 0, sequenceRng([0]))).toBe(1);
  });

  it('剩 1 颗时拿 1', () => {
    expect(nimBartenderTake(1, 5, 0, sequenceRng([0.5]))).toBe(1);
    expect(nimBartenderTake(1, 5, 1, sequenceRng([0.5]))).toBe(1);
  });

  it('任意局面拿的数量都在 [1, min(k, 剩余)]', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 1000; i++) {
      const left = 1 + rng.int(40);
      const k = 3 + rng.int(3);
      const mistake = [0, 0.5, 1][i % 3]!;
      const take = nimBartenderTake(left, k, mistake, rng);
      expect(take).toBeGreaterThanOrEqual(1);
      expect(take).toBeLessThanOrEqual(Math.min(k, left));
    }
  });
});

describe('秘制调料的计分（设计 §4）', () => {
  const secret = [0, 1, 2, 3];
  it('A：调料和位置都对；B：调料对、位置不对', () => {
    expect(spiceScore(secret, [0, 1, 2, 3])).toEqual({ a: 4, b: 0 });
    expect(spiceScore(secret, [4, 5, 6, 7])).toEqual({ a: 0, b: 0 });
    expect(spiceScore(secret, [3, 2, 1, 0])).toEqual({ a: 0, b: 4 });
    expect(spiceScore(secret, [0, 2, 1, 9])).toEqual({ a: 1, b: 2 });
  });

  it('第几次猜中落在哪一档', () => {
    const tiers = [{ maxTries: 4 }, { maxTries: 6 }, { maxTries: 8 }];
    expect([1, 4, 5, 6, 7, 8].map((n) => spiceTier(n, tiers))).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('一掷千金的报价（设计 §4）', () => {
  it('剩余平均 × 估价成数 × 本轮系数，四舍五入到百位', () => {
    expect(dealOffer([70000, 1200], 0.95, 0.5)).toBe(16900);
    const all = [1200, 3600, 4400, 6000, 7200, 10800, 15000, 15000, 28000, 70000];
    expect(dealOffer(all, 0.5, 0.5)).toBe(4000);
  });
});
