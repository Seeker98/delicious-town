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

describe('bar.nim（最后一颗糖，问题记录 427-1）', () => {
  const withNim = (f: (n: { tables: Record<string, Record<string, unknown>> }) => void) => {
    const t = structuredClone(tuningJson) as unknown as {
      bar: { nim: { tables: Record<string, Record<string, unknown>> } };
    };
    f(t.bar.nim);
    return tuningSchema.safeParse(t).success;
  };

  it('合法配置通过；k、糖果数要是 [下限, 上限]，糖果数下限要大于 k 上限', () => {
    expect(withNim(() => undefined)).toBe(true);
    expect(withNim((n) => (n.tables.expert!.k = [5, 3]))).toBe(false);
    expect(withNim((n) => (n.tables.expert!.pile = [5, 40]))).toBe(false);
    expect(withNim((n) => (n.tables.novice!.pile = [3, 20]))).toBe(false);
  });

  it('失手概率在 0~1；先后只能是 choose 或 coin', () => {
    expect(withNim((n) => (n.tables.novice!.mistake = 1.2))).toBe(false);
    expect(withNim((n) => (n.tables.novice!.first = 'x'))).toBe(false);
  });
});

describe('bar.spice（秘制调料，问题记录 427-2）', () => {
  const withSpice = (f: (s: Record<string, unknown> & { tiers: Array<Record<string, unknown>> }) => void) => {
    const t = structuredClone(tuningJson) as unknown as {
      bar: { spice: Record<string, unknown> & { tiers: Array<Record<string, unknown>> } };
    };
    f(t.bar.spice);
    return tuningSchema.safeParse(t).success;
  };

  it('合法配置通过；配方长度不能超过调料种数，种数最多 10', () => {
    expect(withSpice(() => undefined)).toBe(true);
    expect(withSpice((s) => (s.length = 11))).toBe(false);
    expect(withSpice((s) => (s.kinds = 11))).toBe(false);
  });

  it('档位的次数要递增，最后一档等于最多猜几次', () => {
    expect(withSpice((s) => (s.tiers[1]!.maxTries = 3))).toBe(false);
    expect(withSpice((s) => (s.tiers[2]!.maxTries = 7))).toBe(false);
  });
});

describe('bar.cup（猜酒杯改版，问题记录 427-5）', () => {
  type Cup = { cups: number[]; tiers: Array<Record<string, unknown>> };
  const withCup = (f: (c: Cup) => void) => {
    const t = structuredClone(tuningJson) as unknown as { bar: { cup: Cup } };
    f(t.bar.cup);
    return tuningSchema.safeParse(t).success;
  };

  it('合法配置通过；每轮杯子数和奖励档一样多', () => {
    expect(withCup(() => undefined)).toBe(true);
    expect(withCup((c) => (c.cups = [2, 3, 5]))).toBe(false);
  });

  it('杯子数 2~10；新闻只能是 news、broadcast 或 null', () => {
    expect(withCup((c) => (c.cups[0] = 1))).toBe(false);
    expect(withCup((c) => (c.cups[3] = 11))).toBe(false);
    expect(withCup((c) => (c.tiers[0]!.news = 'loud'))).toBe(false);
  });
});

describe('bar.deal（一掷千金，问题记录 427-3）', () => {
  type Deal = { prizes: Array<Record<string, unknown>>; opens: number[]; offerRates: number[] };
  const withDeal = (f: (d: Deal) => void) => {
    const t = structuredClone(tuningJson) as unknown as { bar: { deal: Deal } };
    f(t.bar.deal);
    return tuningSchema.safeParse(t).success;
  };

  it('合法配置通过；每轮开几个加起来 = 奖品数 − 2，和每轮系数一样多', () => {
    expect(withDeal(() => undefined)).toBe(true);
    expect(withDeal((d) => (d.opens = [3, 2, 2, 2]))).toBe(false);
    expect(withDeal((d) => (d.offerRates = [0.5, 0.65, 0.8]))).toBe(false);
  });

  it('奖品等级 1~5；至少 3 个奖品', () => {
    expect(withDeal((d) => (d.prizes[0]!.level = 6))).toBe(false);
    expect(withDeal((d) => (d.prizes = d.prizes.slice(0, 2)))).toBe(false);
  });
});

describe('futures（食材期货，期货设计 §8）', () => {
  type F = Record<string, unknown>;
  const withF = (f: (x: F) => void) => {
    const t = structuredClone(tuningJson) as unknown as { futures: F };
    f(t.futures);
    return tuningSchema.safeParse(t).success;
  };
  it('默认值合法；premium、capRate 不小于 1，定金比例在 (0, 1]，额度正好 5 个', () => {
    expect(withF(() => undefined)).toBe(true);
    expect(withF((x) => (x.premium = 0.9))).toBe(false);
    expect(withF((x) => (x.capRate = 0.5))).toBe(false);
    expect(withF((x) => (x.depositRate = 0))).toBe(false);
    expect(withF((x) => (x.depositRate = 1.1))).toBe(false);
    expect(withF((x) => (x.dailyQuota = [1, 2, 3, 4]))).toBe(false);
  });
});

describe('wealth（食材理财，理财设计 §3.1）', () => {
  type W = Record<string, unknown>;
  const withW = (f: (x: W) => void) => {
    const t = structuredClone(tuningJson) as unknown as { wealth: W };
    f(t.wealth);
    return tuningSchema.safeParse(t).success;
  };
  it('默认值合法；提前取出比例在 (0, 1]，期限至少一项，天数、个数、一档金额至少 1', () => {
    expect(withW(() => undefined)).toBe(true);
    expect(withW((x) => (x.earlyRate = 0))).toBe(false);
    expect(withW((x) => (x.earlyRate = 1.1))).toBe(false);
    expect(withW((x) => (x.terms = []))).toBe(false);
    expect(withW((x) => ((x.terms as W[])[0]!.days = 0))).toBe(false);
    expect(withW((x) => ((x.terms as W[])[0]!.perUnit = 0))).toBe(false);
    expect(withW((x) => (x.unit = 0))).toBe(false);
  });
});

describe('bulk（特许大宗认购，大宗认购设计 §2.1）', () => {
  type B = Record<string, unknown>;
  const withB = (f: (x: B) => void) => {
    const t = structuredClone(tuningJson) as unknown as { bulk: B };
    f(t.bulk);
    return tuningSchema.safeParse(t).success;
  };
  it('默认值合法；openHour 0~23、qty 和 levelWeights 各 5 项、比例在范围内', () => {
    expect(withB(() => undefined)).toBe(true);
    expect(withB((x) => (x.openHour = 24))).toBe(false);
    expect(withB((x) => (x.qty = [1, 2, 3, 4]))).toBe(false);
    expect(withB((x) => (x.qty = [0, 1, 1, 1, 1]))).toBe(false);
    expect(withB((x) => (x.levelWeights = [0, 0, 0, 0, 0]))).toBe(false);
    expect(withB((x) => (x.reserveRate = 0.9))).toBe(false);
    expect(withB((x) => (x.capRate = 0))).toBe(false);
    expect(withB((x) => (x.minRaise = 0))).toBe(false);
    expect(withB((x) => (x.consolationRate = 1.1))).toBe(false);
    // 最后多久停更（问题记录 595）：0 = 全程实时，不能是负数
    expect(withB((x) => (x.blindMin = 0))).toBe(true);
    expect(withB((x) => (x.blindMin = -1))).toBe(false);
  });
});

describe('wishTree（许愿树设计 §2）', () => {
  type W = Record<string, unknown>;
  const withW = (f: (x: W) => void) => {
    const t = structuredClone(tuningJson) as unknown as { wishTree: W };
    f(t.wishTree);
    return tuningSchema.safeParse(t).success;
  };
  it('默认值合法；hour 0~23、等级和天数至少 1、清单至少一项、数量至少 1、权重大于 0', () => {
    expect(withW(() => undefined)).toBe(true);
    expect(withW((x) => (x.hour = 24))).toBe(false);
    expect(withW((x) => (x.hour = -1))).toBe(false);
    expect(withW((x) => (x.minLevel = 0))).toBe(false);
    expect(withW((x) => (x.titleDays = 0))).toBe(false);
    expect(withW((x) => (x.consolationLevel = 0))).toBe(false);
    expect(withW((x) => (x.prizes = []))).toBe(false);
    expect(withW((x) => ((x.prizes as W[])[0]!.num = 0))).toBe(false);
    expect(withW((x) => ((x.prizes as W[])[0]!.weight = 0))).toBe(false);
  });
});
