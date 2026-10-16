import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import {
  avgOf,
  basePrice,
  buyBlock,
  cedeRound,
  cedeState,
  dayDiff,
  decayHeat,
  heatAfterAcquire,
  heatAfterListedSale,
  listPrice,
  priceOf,
  redeemPrice,
  share,
  splitFirst,
  splitRedeem,
  splitResale,
  tendCost,
  tendPacks,
  validListRate,
  windowDays,
  type BuyFacts,
} from './rules';

const t = testConfig().tuning.acquire;

describe('身价和热度（收购 PR 1；改版 2026-10-16）', () => {
  it('基础身价 = 7 天合计 / 7 × 3.5，向下取整，不低于 10 万', () => {
    expect(basePrice(7_000_000, t)).toBe(3_500_000);
    expect(basePrice(1_000_001, t)).toBe(500_000);
    expect(basePrice(0, t)).toBe(100_000);
  });

  it('身价 = 基础 × 热度取整；挂牌价按比例跟着身价走', () => {
    expect(priceOf({ base: 1_000_000, heat: 1.24 })).toBe(1_240_000);
    expect(listPrice({ base: 1_000_000, heat: 1.2, list_rate: 0.5 })).toBe(600_000);
    expect(listPrice({ base: 1_000_000, heat: 1, list_rate: 1.2 })).toBe(1_200_000);
    expect(listPrice({ base: 1_000_000, heat: 1.2, list_rate: null })).toBeNull();
  });

  it('热度：强收 +0.1 封顶 2；挂牌被买 −0.1 不低于 1；每天回落 10%；保留 3 位小数', () => {
    expect(heatAfterAcquire(1, t)).toBe(1.1);
    expect(heatAfterAcquire(1.95, t)).toBe(2);
    expect(heatAfterListedSale(1.05, t)).toBe(1);
    expect(heatAfterListedSale(1.4, t)).toBe(1.3);
    expect(decayHeat(2, t)).toBe(1.9);
    expect(decayHeat(1.2, t)).toBe(1.18);
    expect(decayHeat(1, t)).toBe(1);
  });

  it('挂牌价 50%~120%，5% 一档', () => {
    for (const r of [0.5, 0.75, 1, 1.05, 1.2]) expect(validListRate(r, t), String(r)).toBe(true);
    for (const r of [0.45, 0.52, 1.25, 1.13, 0]) expect(validListRate(r, t), String(r)).toBe(false);
  });

  it('分成向下取整，不出浮点误差', () => {
    expect(share(700_000, 0.9)).toBe(630_000);
    expect(share(1_240_001, 0.9)).toBe(1_116_000);
  });
});

describe('能不能买（收购 PR 1；改版 2026-10-16）', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  const ok: BuyFacts = {
    buyerId: 1,
    buyerStar: 2,
    buyerCreatedAt: new Date('2026-10-01T00:00:00Z'),
    buyerTodayCount: 0,
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
    now,
  };

  it('都满足时能强收', () => expect(buyBlock(ok, t, 'acquire')).toBeNull());

  it.each<[Partial<BuyFacts>, string]>([
    [{ targetId: 1 }, 'self'],
    [{ targetOwnerId: 1 }, 'mine'],
    [{ targetNpc: true }, 'npc'],
    [{ targetBanned: true }, 'banned'],
    [{ buyerStar: 1 }, 'buyer_star'],
    [{ buyerCreatedAt: new Date('2026-10-14T00:00:01Z') }, 'buyer_new'],
    [{ buyerOwned: true }, 'buyer_owned'],
    [{ targetStar: 1 }, 'star'],
    [{ targetOwnerId: 9 }, 'owned'],
    [{ protectedUntil: new Date(now.getTime() + 1000) }, 'protected'],
    [{ todayCount: 1 }, 'daily'],
    [{ pairRecent: true }, 'pair'],
    [{ holdings: 10 }, 'holdings'],
    [{ buyerTodayCount: 3 }, 'buyer_daily'],
  ])('%o → %s', (patch, reason) => expect(buyBlock({ ...ok, ...patch }, t, 'acquire')).toBe(reason));

  it('注册正好满 7 天、保护期已过的可以买', () => {
    expect(buyBlock({ ...ok, buyerCreatedAt: new Date('2026-10-13T00:00:00Z') }, t, 'acquire')).toBeNull();
    expect(buyBlock({ ...ok, protectedUntil: new Date(now.getTime() - 1) }, t, 'acquire')).toBeNull();
  });

  it('有老板的店只能买挂牌；买挂牌不算目标店每天被强收的次数', () => {
    expect(buyBlock(ok, t, 'listed')).toBe('not_listed');
    const listed = { ...ok, targetOwnerId: 9, listed: true, todayCount: 1 };
    expect(buyBlock(listed, t, 'listed')).toBeNull();
    expect(buyBlock(listed, t, 'acquire')).toBe('owned');
  });
});

describe('分账（改版 2026-10-16）：四项加起来是价格', () => {
  const sum = (s: { sellerGot: number; storeGot: number; burn: number; tax: number }) =>
    s.sellerGot + s.storeGot + s.burn + s.tax;

  it('强收没有老板的店：店 50%、并购咨询费 40% 销毁、税 10%', () => {
    expect(splitFirst(2_310_000, t)).toEqual({
      sellerGot: 0,
      storeGot: 1_155_000,
      burn: 924_000,
      tax: 231_000,
    });
    const odd = splitFirst(1_000_003, t);
    expect(sum(odd)).toBe(1_000_003);
    expect(odd.storeGot).toBe(500_001);
  });

  it('买挂牌：原老板 85%、店 5%、税 10%', () => {
    expect(splitResale(1_820_000, t)).toEqual({
      sellerGot: 1_547_000,
      storeGot: 91_000,
      burn: 0,
      tax: 182_000,
    });
    expect(sum(splitResale(999_999, t))).toBe(999_999);
  });

  it('赎身：老板 60%、销毁 30%、税 10%', () => {
    expect(splitRedeem(3_395_000, t)).toEqual({
      sellerGot: 2_037_000,
      storeGot: 0,
      burn: 1_018_500,
      tax: 339_500,
    });
    expect(sum(splitRedeem(777_777, t))).toBe(777_777);
  });

  it('赎身价按基础身价、不乘热度；挂牌更便宜时按挂牌价', () => {
    const s = { base: 1_000_000, heat: 1.5, list_rate: 0.5 };
    expect(redeemPrice({ ...s, list_rate: null }, false)).toBe(1_000_000);
    expect(redeemPrice(s, true)).toBe(750_000);
    // 挂牌价比基础身价高：照基础身价
    expect(redeemPrice({ ...s, list_rate: 1 }, true)).toBe(1_000_000);
    expect(redeemPrice(s, false)).toBe(1_000_000);
  });
});

describe('打理和让渡（改版 2026-10-16）', () => {
  it('日均 = 基础身价 ÷ 3.5；打理付日均 1%（至少 1）；补给包日均每满 43 万一个，最多 3 个', () => {
    expect(avgOf(3_395_000, t)).toBe(970_000);
    expect(tendCost(3_395_000, t)).toBe(9_700);
    expect(tendCost(100, t)).toBe(1);
    expect(tendPacks(3_395_000, t)).toBe(2);
    expect(tendPacks(1_260_000, t)).toBe(0);
    expect(tendPacks(1_505_000, t)).toBe(1);
    expect(tendPacks(35_000_000, t)).toBe(3);
  });

  it('包的价值不超过日均的 1%，被收购不会变成净赚', () => {
    // 二级补给包按约 4,300 算：日均正好满一档时最贵
    for (const k of [1, 2, 3]) expect(k * 4_300).toBeLessThanOrEqual(share(k * t.tendPackStep, 0.01));
  });

  it('游戏日相差几天', () => {
    expect(dayDiff('2026-10-16', '2026-10-16')).toBe(0);
    expect(dayDiff('2026-10-16', '2026-10-19')).toBe(3);
    expect(dayDiff('2026-10-31', '2026-11-01')).toBe(1);
  });

  // 游戏日按北京时间：UTC 16:00 是第二天 00:00
  const at = (day: string, h = 10) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00+08:00`);

  it('今天打理过：4.9%；没打理：3.5%；3 天没打理减半；7 天归零', () => {
    const today = '2026-10-20';
    expect(cedeState({ tended_at: at(today), acquired_at: at('2026-10-01') }, today, t)).toEqual({
      tendedToday: true,
      idleDays: 0,
      rate: 0.049,
    });
    expect(cedeState({ tended_at: at('2026-10-18'), acquired_at: at('2026-10-01') }, today, t).rate).toBe(
      0.035,
    );
    expect(cedeState({ tended_at: at('2026-10-17'), acquired_at: at('2026-10-01') }, today, t).rate).toBe(
      0.0175,
    );
    expect(cedeState({ tended_at: at('2026-10-14'), acquired_at: at('2026-10-01') }, today, t).rate).toBe(
      0.0175,
    );
    expect(cedeState({ tended_at: at('2026-10-13'), acquired_at: at('2026-10-01') }, today, t)).toEqual({
      tendedToday: false,
      idleDays: 7,
      rate: 0,
    });
  });

  it('从没打理过：按收购那天算几天没打理；收购当天不算打理过', () => {
    const today = '2026-10-20';
    expect(cedeState({ tended_at: null, acquired_at: at(today) }, today, t)).toEqual({
      tendedToday: false,
      idleDays: 0,
      rate: 0.035,
    });
    expect(cedeState({ tended_at: null, acquired_at: at('2026-10-17') }, today, t).rate).toBe(0.0175);
  });

  it('一轮的让渡：打理以后先 × 1.035 再按比例让，零头留给店；银币不是正数不让', () => {
    expect(cedeRound(100_000, { tendedToday: false, rate: 0.035 }, t)).toEqual({
      coin: 100_000,
      ceded: 3_500,
    });
    expect(cedeRound(100_000, { tendedToday: true, rate: 0.049 }, t)).toEqual({
      coin: 103_500,
      ceded: 5_071,
    });
    expect(cedeRound(10, { tendedToday: false, rate: 0.035 }, t)).toEqual({ coin: 10, ceded: 0 });
    expect(cedeRound(0, { tendedToday: true, rate: 0.049 }, t)).toEqual({ coin: 0, ceded: 0 });
    expect(cedeRound(-5, { tendedToday: true, rate: 0.049 }, t)).toEqual({ coin: -5, ceded: 0 });
  });
});

describe('身价的天数（收购 PR 3 审查：收入汇总从上线那天才开始攒）', () => {
  const w = { from: '2026-10-03', to: '2026-10-10' };
  it('窗口里有汇总数据的天数：最早的汇总日以后才算；最少 1 天，最多 priceDays', () => {
    expect(windowDays(w, '2026-10-04', t)).toBe(6);
    expect(windowDays(w, '2026-10-01', t)).toBe(7);
    expect(windowDays(w, '2026-10-09', t)).toBe(1);
    // 还一行汇总都没有：照 priceDays（合计是 0，反正是下限）
    expect(windowDays(w, null, t)).toBe(7);
  });
  it('基础身价按实际天数平均', () => {
    expect(basePrice(400_000, t, 2)).toBe(700_000);
    expect(basePrice(400_000, t)).toBe(200_000);
  });
});
