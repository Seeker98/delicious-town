import { describe, expect, it } from 'vitest';
import { tuningSchema, type Food } from '@dt/config';
import { testConfig } from '../../../test/config';
import { makerBase, makerBuyQty, makerPrices, marketFloor } from './maker';
import { initialRef, priceBand } from './rules';

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
    expect(makerPrices(1000, null, band, m, 1000)).toEqual({ bid: 700, ask: 1300, floor: false });
    expect(makerPrices(1001, null, priceBand(1001, ex), m, 1001)).toEqual({
      bid: 700,
      ask: 1302,
      floor: false,
    });
  });

  it('被菜场价封顶', () => {
    expect(makerPrices(1000, 1000, band, m, 1000).bid).toBe(700);
    expect(makerPrices(1000, 700, band, m, 1000).bid).toBe(630);
  });

  it('低于挂单下限时照样给兜底买价（floor，问题记录 244），不往上抬；买价永远不高于卖价（Review Focus 3）', () => {
    expect(makerPrices(1000, 550, band, m, 1000)).toEqual({ bid: 495, ask: 1300, floor: true });
    // 特价货架封顶 2999 × 0.7 × 0.9 = 1889，3 级参考价 3800 时下限 1900：兜底收
    expect(makerPrices(3800, 2999 * CHEAPEST, priceBand(3800, ex), m, 3800)).toMatchObject({
      bid: 1889,
      floor: true,
    });
    for (const ref of [1, 7, 999, 3800, 62000])
      for (const floor of [null, ref * 0.3, ref * 2]) {
        const p = makerPrices(ref, floor, priceBand(ref, ex), m, ref);
        if (p.bid !== null) expect(p.bid).toBeLessThan(p.ask);
      }
  });

  it('夹在允许范围内', () => {
    expect(makerPrices(1000, null, band, { ...m, bidRate: 3, askRate: 3 }, 1000)).toEqual({
      bid: 2000,
      ask: 2000,
      floor: false,
    });
    expect(makerPrices(1000, null, band, { ...m, askRate: 0.3 }, 1000).ask).toBe(500);
  });
});

describe('3~5 级兜底收购（问题记录 244）', () => {
  it('真实配置：3~5 级特价货架上的食材都有兜底买价，且低于特价货架最便宜的价格，买来卖给系统必亏', () => {
    const cheapestSpecial = mt.specialPrice * CHEAPEST * mt.priceFactor;
    for (const lv of [3, 4, 5]) {
      for (const food of config.foodPools.get(lv)?.items ?? []) {
        const ref = initialRef(food, config);
        const p = makerPrices(
          ref,
          marketFloor(food, config, mt),
          priceBand(ref, ex),
          m,
          makerBase(food, config, ex),
        );
        expect(p.bid, food.name).not.toBeNull();
        expect(p.bid!, food.name).toBeLessThan(cheapestSpecial);
      }
    }
  });

  it('1 级仍是普通买档，不是兜底', () => {
    const food = rareAt(1);
    const ref = initialRef(food, config);
    const p = makerPrices(
      ref,
      marketFloor(food, config, mt),
      priceBand(ref, ex),
      m,
      makerBase(food, config, ex),
    );
    expect(p.floor).toBe(false);
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

describe('收购价按初始参考价封顶（终审 C1：防止推高参考价后卖给系统）', () => {
  it('参考价被推高时买价不超过 初始参考价 × 0.7（推到下限都高过它时变成兜底价，仍是 700）；卖价照常按参考价；参考价下跌时买价跟着降', () => {
    expect(makerPrices(1300, null, priceBand(1300, ex), m, 1000)).toEqual({
      bid: 700,
      ask: 1690,
      floor: false,
    });
    expect(makerPrices(1800, null, priceBand(1800, ex), m, 1000)).toEqual({
      bid: 700,
      ask: 2340,
      floor: true,
    });
    expect(makerPrices(800, null, priceBand(800, ex), m, 1000)).toEqual({
      bid: 560,
      ask: 1040,
      floor: false,
    });
  });

  it('初始参考价：refOverrides 优先，否则 initialRef', () => {
    const f = rareAt(6);
    expect(makerBase(f, config, ex)).toBe(initialRef(f, config));
    expect(makerBase(f, config, { ...ex, refOverrides: { [String(f.id)]: 777 } })).toBe(777);
  });
});

describe('系统做市数值校验（终审 I3）', () => {
  const parse = (maker: Record<string, unknown>) =>
    tuningSchema.safeParse({ ...config.tuning, exchange: { ...ex, maker: { ...m, ...maker } } }).success;
  it('收购倍数要低于卖出倍数，菜场封顶倍数不超过 1', () => {
    expect(parse({})).toBe(true);
    expect(parse({ bidRate: 1.3, askRate: 1.3 })).toBe(false);
    expect(parse({ bidRate: 1, askRate: 0.9 })).toBe(false);
    expect(parse({ marketCapRate: 1.1 })).toBe(false);
  });
});
