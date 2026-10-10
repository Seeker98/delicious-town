import { describe, expect, it } from 'vitest';
import { futuresDeposit, futuresQuota, futuresUnitPrice } from './rules';

const t = {
  deliverHours: 72,
  premium: 1.2,
  capRate: 2,
  depositRate: 0.3,
  dailyQuota: [500, 500, 100, 100, 100],
  personDaily: 50,
};

describe('期货定价（期货设计 §3）', () => {
  it('参考价低于等级价按等级价，高于等级价 × 2 按两倍，中间按参考价；乘 1.2 向上取整', () => {
    expect(futuresUnitPrice(9000, 4500, t)).toBe(10800);
    expect(futuresUnitPrice(9000, 12001, t)).toBe(14402);
    expect(futuresUnitPrice(9000, 50000, t)).toBe(21600);
    expect(futuresUnitPrice(2860, 2860, t)).toBe(3432);
  });

  it('定金 = ceil(总价 × 比例)，浮点误差不多算 1', () => {
    expect(futuresDeposit(10800, t)).toBe(3240);
    expect(futuresDeposit(10001, t)).toBe(3001);
    expect(futuresDeposit(100, { ...t, depositRate: 0.7 })).toBe(70);
  });

  it('额度：单独设的优先，否则按等级默认；0 是有效的单独额度', () => {
    expect(futuresQuota(2, null, t)).toBe(500);
    expect(futuresQuota(5, null, t)).toBe(100);
    expect(futuresQuota(5, 7, t)).toBe(7);
    expect(futuresQuota(5, 0, t)).toBe(0);
  });
});
