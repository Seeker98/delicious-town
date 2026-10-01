import { describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { manualCost, manualRenown, personLimit, rollShelf, unitPrice } from './rules';

const config = testConfig();
const t = config.tuning.market;

describe('货架（规格书 06 §6.1）', () => {
  it('日常：5 种（20 点 6 种），1~2 级，不重复；稀有食材库存 2048', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const items = rollShelf(0, 10, config, t, seededRng(seed));
      expect(items).toHaveLength(5);
      expect(new Set(items.map((x) => x.foodsId)).size).toBe(5);
      for (const x of items) {
        const f = config.requireFood(x.foodsId);
        expect([1, 2]).toContain(f.level);
        expect(x.stock).toBe(f.odds < 100 ? 2048 : 5999);
      }
    }
    expect(rollShelf(0, 20, config, t, seededRng(1))).toHaveLength(6);
  });
  it('特价：2 种 3~5 级，库存 40~79；可能多一种热门稀缺食材（库存减半）', () => {
    let sawHot = false;
    for (let seed = 1; seed <= 30; seed++) {
      const items = rollShelf(1, 10, config, t, seededRng(seed));
      const normal = items.filter((x) => !x.hot);
      expect(normal).toHaveLength(2);
      for (const x of normal) {
        expect([3, 4, 5]).toContain(config.requireFood(x.foodsId).level);
        expect(x.stock).toBeGreaterThanOrEqual(40);
        expect(x.stock).toBeLessThan(80);
      }
      const hot = items.filter((x) => x.hot);
      if (hot.length > 0) {
        sawHot = true;
        expect(hot[0]!.stock).toBeLessThan(40);
      }
    }
    expect(sawHot).toBe(true);
  });
  it('高级：3 种 4 级食材', () => {
    const items = rollShelf(2, 12, config, t, seededRng(3));
    expect(items).toHaveLength(3);
    expect(items.every((x) => config.requireFood(x.foodsId).level === 4)).toBe(true);
  });
});

describe('价格与限购（规格书 06 §6.2）', () => {
  const food = config.requireFood(101);
  it('价格随天气浮动；特价固定 2999；高级 ×2', () => {
    expect(unitPrice(0, food, t, { marketCoin: -0.2 })).toBeCloseTo(food.coin * 0.8);
    expect(unitPrice(1, food, t, {})).toBe(2999);
    expect(unitPrice(2, food, t, {})).toBe(food.coin * 2);
  });
  it('日常稀有食材上架 55 分钟内每人最多 odds×2+10 份', () => {
    const opened = new Date('2026-09-30T00:00:00Z');
    expect(personLimit(0, food, opened, new Date(opened.getTime() + 54 * 60_000), t)).toBe(
      food.odds * 2 + 10,
    );
    expect(personLimit(0, food, opened, new Date(opened.getTime() + 56 * 60_000), t)).toBe(1000);
    expect(personLimit(1, food, opened, opened, t)).toBe(1);
    expect(personLimit(2, food, opened, opened, t)).toBe(9);
  });
});

describe('手动进货（4E-2）', () => {
  const m = testConfig().tuning.market;
  it('费用：第 1、2 次 100 万，第 3 次 200 万', () => {
    expect([0, 1, 2, 3].map((n) => manualCost(n, m))).toEqual([1e6, 1e6, 2e6, 3e6]);
  });
  it('声望：前 2 次减半，第 5 次起 500', () => {
    expect(manualRenown(0, 1e6)).toBe(50);
    expect(manualRenown(2, 2e6)).toBe(200);
    expect(manualRenown(5, 5e6)).toBe(500);
  });
});
