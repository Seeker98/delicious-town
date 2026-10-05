import { describe, expect, it } from 'vitest';
import { FOODS } from '@dt/config';
import { testConfig } from '../../test/config';
import { dishCoin, foodPrice, levelRateOf, universalLevel } from './prices';
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
