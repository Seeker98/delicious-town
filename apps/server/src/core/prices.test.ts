import { describe, expect, it } from 'vitest';
import { testConfig } from '../../test/config';
import { dishCoin, foodPrice, levelRateOf } from './prices';

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
    expect(levelRateOf(config.requireFood(467), rates)).toBe(1.1);
    expect(levelRateOf(config.requireFood(471), rates)).toBe(1.5);
    const odd = [...config.foods.values()].find((f) => f.level > 7 && (f.id < 467 || f.id > 471));
    if (odd) expect(levelRateOf(odd, rates)).toBe(1);
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
    expect(Number.isInteger(foodPrice({ ...level(3), coin: 3600 }, { levelPriceRate: [1, 1, 1.3] }))).toBe(true);
  });
});
