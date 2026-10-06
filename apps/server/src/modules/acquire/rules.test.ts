import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import {
  basePrice,
  buyBlock,
  capDividends,
  decayHeat,
  dividendCap,
  dividendOf,
  heatAfterAcquire,
  heatAfterListedSale,
  listPrice,
  priceOf,
  share,
  validListRate,
  windowDays,
  type BuyFacts,
} from './rules';

const t = testConfig().tuning.acquire;

describe('身价和热度（收购 PR 1）', () => {
  it('基础身价 = 7 天合计 / 7 × 5，向下取整，不低于 10 万', () => {
    expect(basePrice(7_000_000, t)).toBe(5_000_000);
    expect(basePrice(1_000_001, t)).toBe(714_286);
    expect(basePrice(0, t)).toBe(100_000);
  });

  it('身价 = 基础 × 热度取整；挂牌价按折扣跟着身价走', () => {
    expect(priceOf({ base: 1_000_000, heat: 1.24 })).toBe(1_240_000);
    expect(listPrice({ base: 1_000_000, heat: 1.2, list_rate: 0.5 })).toBe(600_000);
    expect(listPrice({ base: 1_000_000, heat: 1.2, list_rate: null })).toBeNull();
  });

  it('热度：强收 +0.2 封顶 3；挂牌被买 −0.1 不低于 1；每天回落 10%；保留 3 位小数', () => {
    expect(heatAfterAcquire(1, t)).toBe(1.2);
    expect(heatAfterAcquire(2.9, t)).toBe(3);
    expect(heatAfterListedSale(1.05, t)).toBe(1);
    expect(heatAfterListedSale(1.4, t)).toBe(1.3);
    expect(decayHeat(2, t)).toBe(1.9);
    expect(decayHeat(1.2, t)).toBe(1.18);
    expect(decayHeat(1, t)).toBe(1);
  });

  it('挂牌折扣 50%~100%，5% 一档', () => {
    for (const r of [0.5, 0.75, 0.95, 1]) expect(validListRate(r, t), String(r)).toBe(true);
    for (const r of [0.45, 0.52, 1.05, 0]) expect(validListRate(r, t), String(r)).toBe(false);
  });

  it('分成向下取整，不出浮点误差', () => {
    expect(share(700_000, 0.9)).toBe(630_000);
    expect(share(1_240_001, 0.9)).toBe(1_116_000);
  });
});

describe('能不能买（收购 PR 1）', () => {
  const ok: BuyFacts = {
    buyerId: 1,
    targetId: 2,
    targetOwnerId: null,
    buyerOwned: false,
    holdings: 0,
    targetStar: 2,
    targetNpc: false,
    targetBanned: false,
    protectedUntil: null,
    todayCount: 0,
    pairRecent: false,
    listed: false,
    now: new Date(0),
  };

  it('都满足时能强收', () => expect(buyBlock(ok, t, 'acquire')).toBeNull());

  it.each<[Partial<BuyFacts>, string]>([
    [{ targetId: 1 }, 'self'],
    [{ targetOwnerId: 1 }, 'mine'],
    [{ targetNpc: true }, 'npc'],
    [{ targetBanned: true }, 'banned'],
    [{ targetStar: 1 }, 'star'],
    [{ protectedUntil: new Date(1000) }, 'protected'],
    [{ todayCount: 3 }, 'daily'],
    [{ pairRecent: true }, 'pair'],
    [{ buyerOwned: true }, 'buyer_owned'],
    [{ holdings: 10 }, 'holdings'],
  ])('%o → %s', (patch, reason) => expect(buyBlock({ ...ok, ...patch }, t, 'acquire')).toBe(reason));

  it('保护期已过的可以买', () =>
    expect(buyBlock({ ...ok, protectedUntil: new Date(-1) }, t, 'acquire')).toBeNull());

  it('买挂牌要正在挂牌', () => {
    expect(buyBlock(ok, t, 'listed')).toBe('not_listed');
    expect(buyBlock({ ...ok, targetOwnerId: 9, listed: true }, t, 'listed')).toBeNull();
  });
});

describe('分红（收购 PR 2）', () => {
  it('前一天结算 × 5%，打理过 × 1.5；不满 90 轮不发', () => {
    expect(dividendOf(1_000_000, 90, false, t)).toBe(50_000);
    expect(dividendOf(1_000_000, 90, true, t)).toBe(75_000);
    expect(dividendOf(1_000_000, 89, true, t)).toBeNull();
    expect(dividendOf(333, 100, false, t)).toBe(16);
    // 收入是负数（不该有）也不发负的分红
    expect(dividendOf(-1000, 100, false, t)).toBe(0);
  });

  it('封顶 = 近 7 天日均 × 25%', () => {
    expect(dividendCap(7_000_000, t)).toBe(250_000);
    expect(dividendCap(0, t)).toBe(0);
    expect(dividendCap(6, t)).toBe(0);
  });

  it('超过封顶按比例压，合计不超过封顶', () => {
    expect(capDividends([100, 200], 1000)).toEqual([100, 200]);
    expect(capDividends([100, 300], 200)).toEqual([50, 150]);
    const r = capDividends([333, 333, 334], 100);
    expect(r.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100);
    expect(r).toEqual([33, 33, 33]);
    expect(capDividends([5, 5], 0)).toEqual([0, 0]);
    expect(capDividends([], 0)).toEqual([]);
    // 大数不丢精度
    expect(capDividends([4e15, 4e15], 4e15)).toEqual([2e15, 2e15]);
  });
});

describe('身价、封顶的天数（收购 PR 3 审查：收入汇总从上线那天才开始攒）', () => {
  const w = { from: '2026-10-03', to: '2026-10-10' };
  it('窗口里有汇总数据的天数：最早的汇总日以后才算；最少 1 天，最多 priceDays', () => {
    expect(windowDays(w, '2026-10-04', t)).toBe(6);
    expect(windowDays(w, '2026-10-01', t)).toBe(7);
    expect(windowDays(w, '2026-10-09', t)).toBe(1);
    // 还一行汇总都没有：照 priceDays（合计是 0，反正是下限）
    expect(windowDays(w, null, t)).toBe(7);
  });
  it('基础身价、分红封顶按实际天数平均', () => {
    expect(basePrice(400_000, t, 2)).toBe(1_000_000);
    expect(basePrice(400_000, t)).toBe(285_714);
    expect(dividendCap(2_000_000, t, 2)).toBe(250_000);
  });
});
