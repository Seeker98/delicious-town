import { describe, expect, it } from 'vitest';
import { FOODS } from '@dt/config';
import { testConfig } from '../../test/config';
import { dishCoin, fairFoodPrice, foodPrice, levelRateOf, specialShelfPrice, universalLevel } from './prices';
import { fid } from '../../test/items';

const config = testConfig();
const level = (lv: number) => [...config.foods.values()].find((f) => f.level === lv)!;

describe('价格函数（问题记录 240-1）', () => {
  it('dishCoin：乘倍率后向下取整，不低于 1；倍率 1 时原样（Review Focus 3）', () => {
    expect(dishCoin(860, 1)).toBe(860);
    expect(dishCoin(860, 0.15)).toBe(129);
    expect(dishCoin(400, 0.001)).toBe(1);
  });

  it('levelRateOf：按食材等级取倍数；没写的等级按 1（Review Focus 1）', () => {
    expect(levelRateOf(level(1), [2, 3])).toBe(2);
    expect(levelRateOf(level(2), [2, 3])).toBe(3);
    expect(levelRateOf(level(5), [2, 3])).toBe(1);
    expect(levelRateOf(level(3), [])).toBe(1);
  });

  it('levelRateOf：万能食材按它能顶替的等级取，其他非 1~7 级按 1（Review Focus 2）', () => {
    const rates = [1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7];
    expect(levelRateOf(config.requireFood(fid('一级万能食材')), rates)).toBe(1.1);
    expect(levelRateOf(config.requireFood(fid('五级万能食材')), rates)).toBe(1.5);
    // 现有数据里没有这样的食材，构造几个（backlog 240-1、质量期 ②）：8 级、0 级、不在万能食材编号里的 9 级
    const base = level(1);
    for (const odd of [
      { ...base, level: 8 },
      { ...base, level: 0 },
      { ...base, id: FOODS.masterBase + 6, level: 9 },
      { ...base, id: FOODS.masterBase, level: 9 },
    ])
      expect(levelRateOf(odd, rates)).toBe(1);
  });

  it('universalLevel：万能食材编号（masterBase + 1~5）的 9 级食材顶替 1~5 级，其他为 null（质量期 ②）', () => {
    expect(universalLevel(config.requireFood(fid('一级万能食材')))).toBe(1);
    expect(universalLevel(config.requireFood(fid('五级万能食材')))).toBe(5);
    expect(universalLevel(level(3))).toBeNull();
    expect(universalLevel({ ...level(1), id: 472, level: 9 })).toBeNull();
  });

  it('foodPrice = 基础价 × 本等级倍数；倍数全 1 时等于基础价', () => {
    const f = level(3);
    expect(foodPrice(f, { levelPriceRate: [1, 1, 2] })).toBe(f.coin * 2);
    expect(foodPrice(f, { levelPriceRate: [1, 1, 1, 1, 1, 1, 1] })).toBe(f.coin);
  });

  it('浮点尾数不多收、不少给 1 银币（终审小问题）：680 × 0.35 = 238，1800 × 1.3 = 2340', () => {
    expect(dishCoin(680, 0.35)).toBe(238);
    const f = { ...level(2), coin: 1800 };
    expect(foodPrice(f, { levelPriceRate: [1, 1.3] })).toBe(2340);
    expect(Number.isInteger(foodPrice({ ...level(3), coin: 3600 }, { levelPriceRate: [1, 1, 1.3] }))).toBe(
      true,
    );
  });
});

describe('公允价阶梯（2026-10-15）', () => {
  const mt = config.tuning.market;

  it('默认配置：菜场价 [1, 1.3, 2, 3, 4]、公允价 [1, 1.85, 3.1, 5.85, 9.4]，6、7 级都按 1', () => {
    expect(mt.levelPriceRate).toEqual([1, 1.3, 2, 3, 4, 1, 1]);
    expect(mt.fairPriceRate).toEqual([1, 1.85, 3.1, 5.85, 9.4, 1, 1]);
  });

  it('fairFoodPrice：1~5 级各一种 = 基础价 × 公允价倍数（取整）；1 级和菜场价相同', () => {
    const rates = [1, 1.85, 3.1, 5.85, 9.4];
    for (let lv = 1; lv <= 5; lv++) {
      const f = level(lv);
      expect(fairFoodPrice(f, mt), f.name).toBe(Math.round(f.coin * rates[lv - 1]!));
    }
    expect(fairFoodPrice(level(1), mt)).toBe(foodPrice(level(1), mt));
    // 万能食材按顶替的等级
    expect(fairFoodPrice(config.requireFood(fid('五级万能食材')), mt)).toBe(
      Math.round(config.requireFood(fid('五级万能食材')).coin * 9.4),
    );
  });

  it('雪蛤、鹅肝基价 4,200，全麦粉 9,300：两套价都跟着变', () => {
    for (const [name, coin, lv] of [
      ['雪蛤', 4200, 3],
      ['鹅肝', 4200, 3],
      ['全麦粉', 9300, 5],
    ] as const) {
      const f = config.requireFood(fid(name));
      expect(f.coin, name).toBe(coin);
      expect(f.level, name).toBe(lv);
    }
    expect(foodPrice(config.requireFood(fid('雪蛤')), mt)).toBe(8400);
    expect(fairFoodPrice(config.requireFood(fid('雪蛤')), mt)).toBe(13020);
    expect(foodPrice(config.requireFood(fid('全麦粉')), mt)).toBe(37200);
    expect(fairFoodPrice(config.requireFood(fid('全麦粉')), mt)).toBe(87420);
  });

  it('specialShelfPrice：3 / 4 / 5 级 2,499 / 5,999 / 14,999，2 级等没写的按 specialPrice 2,999', () => {
    expect(specialShelfPrice(level(3), mt)).toBe(2499);
    expect(specialShelfPrice(level(4), mt)).toBe(5999);
    expect(specialShelfPrice(level(5), mt)).toBe(14999);
    expect(specialShelfPrice(level(2), mt)).toBe(2999);
    expect(specialShelfPrice(level(6), mt)).toBe(2999);
    expect(specialShelfPrice(level(3), { specialPrice: 100, specialPrices: [] })).toBe(100);
  });
});
