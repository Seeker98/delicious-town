import { describe, expect, it } from 'vitest';
import { initialShares, lmsrCost, lmsrPrice, predictPercent, predictQuote } from './predict';
import { predictCreateBody, predictTradeBody } from './schemas/predict';

const T = { unit: 1000, feeRate: 0.02 };

describe('LMSR 报价（238-1 设计 §4）', () => {
  it('开局 50%：价格 0.5，两边相加为 1', () => {
    expect(lmsrPrice(0, 0, 100)).toBe(0.5);
    const p = lmsrPrice(30, 10, 100);
    expect(p + lmsrPrice(10, 30, 100)).toBeCloseTo(1, 12);
    expect(p).toBeGreaterThan(0.5);
  });

  it('初始概率：y − n = b·ln(p0/(1−p0))，小的一边为 0', () => {
    const a = initialShares(0.8, 100);
    expect(a.n).toBe(0);
    expect(lmsrPrice(a.y, a.n, 100)).toBeCloseTo(0.8, 12);
    const c = initialShares(0.05, 100);
    expect(c.y).toBe(0);
    expect(lmsrPrice(c.y, c.n, 100)).toBeCloseTo(0.05, 12);
    expect(initialShares(0.5, 100)).toEqual({ y: 0, n: 0 });
  });

  it('买 1 份"是"：成交额向上取整、手续费向上取整，价格变高', () => {
    const q = predictQuote({ y: 0, n: 0, b: 100 }, 'yes', 'buy', 1, T);
    const exact = 1000 * (lmsrCost(1, 0, 100) - lmsrCost(0, 0, 100));
    expect(q.amount).toBe(Math.ceil(exact));
    expect(q.fee).toBe(Math.ceil(q.amount * 0.02));
    expect(q.total).toBe(q.amount + q.fee);
    expect(q).toMatchObject({ yAfter: 1, nAfter: 0 });
    expect(q.priceAfter).toBeGreaterThan(0.5);
  });

  it('卖出：成交额向下取整，所得扣手续费', () => {
    const q = predictQuote({ y: 10, n: 0, b: 100 }, 'yes', 'sell', 4, T);
    const exact = 1000 * (lmsrCost(10, 0, 100) - lmsrCost(6, 0, 100));
    expect(q.amount).toBe(Math.floor(exact));
    expect(q.total).toBe(q.amount - Math.ceil(q.amount * 0.02));
    expect(q).toMatchObject({ yAfter: 6, nAfter: 0 });
  });

  it('买了再卖回不赚钱，1 份的小额循环也一样（Review Focus 3）', () => {
    for (const b of [10, 100, 10000])
      for (const k of [1, 7, 100]) {
        const buy = predictQuote({ y: 3, n: 5, b }, 'no', 'buy', k, { unit: 1000, feeRate: 0 });
        const sell = predictQuote({ y: buy.yAfter, n: buy.nAfter, b }, 'no', 'sell', k, {
          unit: 1000,
          feeRate: 0,
        });
        expect(sell.amount).toBeLessThanOrEqual(buy.amount);
      }
  });

  it('系统最大亏损不超过 unit·b·ln(1/p0)（结果一边买满 200 份）', () => {
    for (const p0 of [0.05, 0.3, 0.5, 0.95]) {
      const b = 100;
      const s = initialShares(p0, b);
      const q = predictQuote({ y: s.y, n: s.n, b }, 'yes', 'buy', 200, { unit: 1000, feeRate: 0 });
      const loss = 1000 * 200 - q.amount; // 结果为"是"，系统付 200 份
      expect(loss).toBeLessThanOrEqual(1000 * b * Math.log(1 / p0) + 1);
    }
  });

  it('大份数不溢出、不出现 NaN（Review Focus 5）', () => {
    const s = initialShares(0.05, 10);
    const q = predictQuote({ y: s.y, n: s.n + 5000, b: 10 }, 'yes', 'buy', 999, T);
    expect(Number.isFinite(q.amount)).toBe(true);
    expect(Number.isFinite(q.priceAfter)).toBe(true);
    expect(lmsrPrice(0, 100000, 10)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(lmsrCost(100000, 0, 10))).toBe(true);
  });

  it('显示的百分比在 1~99', () => {
    expect(predictPercent(0.634)).toBe(63);
    expect(predictPercent(0.001)).toBe(1);
    expect(predictPercent(0.999)).toBe(99);
  });
});

describe('请求校验', () => {
  it('买卖：份数为正整数；方向和边只能取规定值', () => {
    expect(predictTradeBody.parse({ side: 'yes', dir: 'buy', qty: 3 })).toEqual({
      side: 'yes',
      dir: 'buy',
      qty: 3,
    });
    expect(predictTradeBody.safeParse({ side: 'maybe', dir: 'buy', qty: 3 }).success).toBe(false);
    expect(predictTradeBody.safeParse({ side: 'yes', dir: 'buy', qty: 0 }).success).toBe(false);
  });

  it('出题：标题 1~60 字、初始概率 5~95、b 10~10000', () => {
    const ok = { shardId: 1, title: '明天会下雨吗', closeAt: '2026-10-03T12:00:00.000Z', p0: 50 };
    expect(predictCreateBody.parse(ok)).toMatchObject({ description: '' });
    expect(predictCreateBody.safeParse({ ...ok, title: '' }).success).toBe(false);
    expect(predictCreateBody.safeParse({ ...ok, p0: 96 }).success).toBe(false);
    expect(predictCreateBody.safeParse({ ...ok, b: 5 }).success).toBe(false);
  });
});

describe('份额差极大时买入不会算成 0（backlog 238-1）', () => {
  it('b = 10、"否"比"是"多 600 份以上：买 1 份"是"至少收 1 银币；差距不大时和精确值取整一致', () => {
    const t = { unit: 100, feeRate: 0 };
    for (const n of [600, 800, 6000, 100_000]) {
      const q = predictQuote({ y: 0, n, b: 10 }, 'yes', 'buy', 1, t);
      expect(q.amount).toBeGreaterThanOrEqual(1);
    }
    // 差距不大时结果不变：和精确值相差不到 1
    const q = predictQuote({ y: 0, n: 200, b: 10 }, 'yes', 'buy', 1, t);
    const exact = 100 * 10 * (Math.log1p(Math.exp(-19.9)) - Math.log1p(Math.exp(-20)));
    expect(q.amount).toBe(Math.ceil(exact));
  });
});
