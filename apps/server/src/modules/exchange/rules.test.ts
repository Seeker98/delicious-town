import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { feeOf, initialRef, isTradable, priceBand, weightedPrice } from './rules';

const config = testConfig();
const t = config.tuning.exchange;

describe('交易所规则（156-1 设计 §5、§6）', () => {
  it('只有稀有食材（odds < 100）可交易', () => {
    const rare = [...config.foods.values()].find((f) => f.odds < 100)!;
    const common = [...config.foods.values()].find((f) => f.odds >= 100)!;
    expect(isTradable(rare)).toBe(true);
    expect(isTradable(common)).toBe(false);
    expect(isTradable(undefined)).toBe(false);
  });
  it('价格范围：下限向上取整、上限向下取整，下限至少 1', () => {
    expect(priceBand(1001, t)).toEqual({ min: 501, max: 2002 });
    expect(priceBand(1, t)).toEqual({ min: 1, max: 2 });
  });
  it('加权均价四舍五入', () => {
    expect(
      weightedPrice([
        { price: 100, qty: 1 },
        { price: 200, qty: 2 },
      ]),
    ).toBe(167);
  });
  it('手续费向下取整', () => {
    expect(feeOf(333, 3, t)).toBe(49);
  });
});

describe('初始参考价（问题记录 242）', () => {
  const byName = (n: string) => [...config.foods.values()].find((f) => f.name === n)!;
  it('普通食材：系统定价夹在同级稀有中位数的 0.75~1.5 倍；雪蛤 9300 → 6300', () => {
    expect(initialRef(byName('雪蛤'), config)).toBe(6300);
    const ok = [...config.foods.values()].find((f) => f.odds < 100 && f.level === 4)!;
    expect(initialRef(ok, config)).toBe(ok.coin);
  });
  it('万能食材：同级稀有中位数 × 1.5', () => {
    expect(initialRef(config.requireFood(468), config)).toBe(4200);
    expect(initialRef(config.requireFood(469), config)).toBe(6300);
    expect(initialRef(config.requireFood(470), config)).toBe(8100);
    expect(initialRef(config.requireFood(471), config)).toBe(16200);
  });
});
