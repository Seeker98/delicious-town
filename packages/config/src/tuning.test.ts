import { describe, expect, it } from 'vitest';
import { tuningSchema } from './tuning';
import tuningJson from '../data/game/tuning.json';

const prizeOf = (foodTiers: unknown) => {
  const t = structuredClone(tuningJson) as { bar: { prize: { foodTiers: unknown } } };
  t.bar.prize.foodTiers = foodTiers;
  return tuningSchema.safeParse(t).success;
};

describe('bar.prize.foodTiers（问题记录 352）', () => {
  it('默认数值通过', () => {
    expect(tuningSchema.safeParse(tuningJson).success).toBe(true);
  });

  it('第一档从 1 开始、minLevel 递增、等级范围 1~5 且最低不超过最高、稀有概率 0~1', () => {
    const ok = { minLevel: 1, levels: [1, 2], rare: 0.2 };
    expect(prizeOf([ok, { minLevel: 4, levels: [3, 4], rare: 0.4 }])).toBe(true);
    expect(prizeOf([])).toBe(false);
    expect(prizeOf([{ ...ok, minLevel: 2 }])).toBe(false);
    expect(prizeOf([ok, { ...ok, minLevel: 1 }])).toBe(false);
    expect(prizeOf([{ ...ok, levels: [3, 2] }])).toBe(false);
    expect(prizeOf([{ ...ok, levels: [1, 6] }])).toBe(false);
    expect(prizeOf([{ ...ok, rare: 1.5 }])).toBe(false);
  });
});

describe('随机奖励类型比例（backlog 352）', () => {
  const withBar = (f: (t: { bar: Record<string, unknown> }) => void) => {
    const t = structuredClone(tuningJson) as unknown as { bar: Record<string, unknown> };
    f(t);
    return tuningSchema.safeParse(t).success;
  };
  const rates = (foods: number, goods: number, coin: number, exp: number) => ({ foods, goods, coin, exp });

  it('四项不能为负，加起来不超过 1（剩下的算食材）', () => {
    expect(withBar((t) => (t.bar.awardRates = rates(0.25, 0.15, 0.3, 0.3)))).toBe(true);
    expect(withBar((t) => (t.bar.awardRates = rates(0.4, 0.15, 0.3, 0.3)))).toBe(false);
    expect(withBar((t) => (t.bar.awardRates = rates(0.25, -0.1, 0.3, 0.3)))).toBe(false);
    expect(withBar((t) => ((t.bar.prize as { rates: unknown }).rates = rates(0.7, 0.3, 0.075, 0.075)))).toBe(
      false,
    );
  });
});
