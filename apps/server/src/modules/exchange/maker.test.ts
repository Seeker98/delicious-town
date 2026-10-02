import { describe, expect, it } from 'vitest';
import type { Food } from '@dt/config';
import { testConfig } from '../../../test/config';
import { makerBuyQty, makerPrices, marketFloor } from './maker';
import { priceBand } from './rules';

const config = testConfig();
const mt = config.tuning.market;
const ex = config.tuning.exchange;
const m = ex.maker;
const rareAt = (level: number) =>
  [...config.foods.values()].find((f) => f.level === level && f.odds < 100 && f.odds > 0)!;
/** 现有天气数据里菜场最便宜是七折（marketCoin −0.3） */
const CHEAPEST = 0.7;

describe('菜场最低价（156-3 设计 §4.1）', () => {
  it('日常货架的等级按系统定价 × 最便宜天气', () => {
    const f = rareAt(1);
    expect(marketFloor(f, config, mt)).toBeCloseTo(f.coin * CHEAPEST, 6);
  });

  it('特价货架的等级按 specialPrice；高级货架等级取两者便宜的', () => {
    const f3 = rareAt(3);
    expect(marketFloor(f3, config, mt)).toBeCloseTo(mt.specialPrice * CHEAPEST, 6);
    const f4 = rareAt(4);
    expect(marketFloor(f4, config, mt)).toBeCloseTo(
      Math.min(mt.specialPrice, f4.coin * mt.premiumPriceFactor) * CHEAPEST,
      6,
    );
  });

  it('热门稀缺池里的食材也算特价货架', () => {
    const f6 = rareAt(6);
    const hot = { ...config, hotFoodPool: { items: [f6], prefix: [1], total: 1 } } as typeof config;
    expect(marketFloor(f6, hot, mt)).toBeCloseTo(mt.specialPrice * CHEAPEST, 6);
  });

  it('菜场不卖的返回 null', () => {
    expect(marketFloor(rareAt(6), config, mt)).toBeNull();
    expect(marketFloor({ ...rareAt(1), level: 8 } as Food, config, mt)).toBeNull();
  });

  it('priceFactor 打折时封顶跟着降（Review Focus 5）', () => {
    const f = rareAt(1);
    expect(marketFloor(f, config, { ...mt, priceFactor: 0.5 })).toBeCloseTo(f.coin * CHEAPEST * 0.5, 6);
  });
});

describe('系统买卖价（156-3 设计 §4.2）', () => {
  const band = priceBand(1000, ex);

  it('买价 = 参考价 × 0.7，卖价 = 参考价 × 1.3', () => {
    expect(makerPrices(1000, null, band, m)).toEqual({ bid: 700, ask: 1300 });
    expect(makerPrices(1001, null, priceBand(1001, ex), m)).toEqual({ bid: 700, ask: 1302 });
  });

  it('被菜场价封顶', () => {
    expect(makerPrices(1000, 1000, band, m).bid).toBe(700);
    expect(makerPrices(1000, 700, band, m).bid).toBe(630);
  });

  it('低于挂单下限没有买价，不往上抬；买价永远不高于卖价（Review Focus 3）', () => {
    expect(makerPrices(1000, 550, band, m)).toEqual({ bid: null, ask: 1300 });
    // 特价货架封顶 2999 × 0.7 × 0.9 = 1889，3 级参考价最低 3800 时下限 1900
    expect(makerPrices(3800, 2999 * CHEAPEST, priceBand(3800, ex), m).bid).toBeNull();
    for (const ref of [1, 7, 999, 3800, 62000])
      for (const floor of [null, ref * 0.3, ref * 2]) {
        const p = makerPrices(ref, floor, priceBand(ref, ex), m);
        if (p.bid !== null) expect(p.bid).toBeLessThan(p.ask);
      }
  });

  it('夹在允许范围内', () => {
    expect(makerPrices(1000, null, band, { ...m, bidRate: 3, askRate: 3 })).toEqual({ bid: 2000, ask: 2000 });
    expect(makerPrices(1000, null, band, { ...m, askRate: 0.3 }).ask).toBe(500);
  });
});

describe('系统能收的数量', () => {
  it('取每日收购、库存上限、个人每日三者剩余的最小值，不小于 0', () => {
    expect(makerBuyQty(m, { bought: 0, stock: 0, playerToday: 0 })).toBe(20);
    expect(makerBuyQty(m, { bought: 95, stock: 0, playerToday: 0 })).toBe(5);
    expect(makerBuyQty(m, { bought: 0, stock: 497, playerToday: 0 })).toBe(3);
    expect(makerBuyQty(m, { bought: 0, stock: 0, playerToday: 18 })).toBe(2);
    expect(makerBuyQty(m, { bought: 120, stock: 0, playerToday: 0 })).toBe(0);
  });
});
