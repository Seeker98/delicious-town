import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, buildInput, type InputPatch } from './globals';
import { computeRates } from './rates';
import type { SettleGlobals } from './types';

const config = testConfig();
/** 其它规则按原作数值断言：低等级经验加成关掉（问题记录 378，下面单独测） */
const tuning = {
  ...config.tuning,
  settlement: { ...config.tuning.settlement, newbieExp: { ...config.tuning.settlement.newbieExp, rate: 0 } },
};
const rates = (patch: InputPatch = {}, g: Partial<SettleGlobals> = {}, rng = [0.5, 0.5]) =>
  computeRates(buildInput(config, patch), buildGlobals(config, tuning, g), sequenceRng(rng));

describe('汇总率（规格书 01 §1.3）', () => {
  it('0 星新店：上座 30%、挑剔 10%、星潜力经验 60%；0 星不受天气影响', () => {
    const { rates: r } = rates({}, { weather: { atRate: 0.5, expRate: 1 } });
    expect(r.atRate.total).toBeCloseTo(0.3);
    expect(r.spRate.total).toBeCloseTo(0.1);
    expect(r.expRate.total).toBeCloseTo(0.6);
    expect(r.expRate.parts).toEqual({ starPotential: 0.6 });
    expect(r.coinRate.total).toBe(0);
    expect(r.seated).toBe(1);
  });

  it('食谱加成：各品级食谱数 × r_L × L × 菜谱上座率倍数（街道再平衡第二版，默认 0.5）', () => {
    const ids = config.cookbookIndex.allIds;
    const cookbooks: Record<number, number> = {};
    for (const id of ids.slice(0, 10)) cookbooks[id] = 1;
    for (const id of ids.slice(10, 15)) cookbooks[id] = 7;
    const { rates: r } = rates({ cookbooks });
    expect(tuning.settlement.cookbookAtRate).toBe(0.5);
    expect(r.atRate.parts.cookbook).toBeCloseTo((10 * 0.000098 + 5 * 0.00011 * 7) * 0.5);
  });

  it('上座率软上限：超过 0.7 的部分只算三分之一再截到 1，压掉的记成负分项；溢出经验按折算前算（街道再平衡第二版）', () => {
    // 0 星：基础 0.3，浮动 0；加 0.6 → 0.9 → 0.7 + 0.2 ÷ 3 ≈ 0.767
    const a = rates({ agg: { atRate: 0.6 } }).rates;
    expect(a.atRate.total).toBeCloseTo(0.7 + 0.2 / 3, 5);
    expect(a.atRate.parts.softCap).toBeCloseTo(0.7 + 0.2 / 3 - 0.9, 5);
    expect(a.expRate.parts.atOverflow).toBeUndefined();
    // 没超过拐点的不记 softCap
    expect(rates({ agg: { atRate: 0.3 } }).rates.atRate.parts.softCap).toBeUndefined();
    // 合计 1.8：折算后 0.7 + 1.1 ÷ 3 ≈ 1.07 截到 1；溢出 (1.8 − 1.2) ÷ 1.5 = 0.4 照旧
    const b = rates({ agg: { atRate: 1.5 } }).rates;
    expect(b.atRate.total).toBe(1);
    expect(b.expRate.parts.atOverflow).toBeCloseTo(0.4);
    // 拐点设 1、比例设 1 就是原版
    const off = { ...tuning, settlement: { ...tuning.settlement, atSoftCapAt: 1, atSoftCapRate: 1 } };
    const c = computeRates(
      buildInput(config, { agg: { atRate: 0.6 } }),
      buildGlobals(config, off),
      sequenceRng([0.5, 0.5]),
    );
    expect(c.rates.atRate.total).toBeCloseTo(0.9);
  });

  it('浮动（2026-10-15）：上座 (0.15 + 0.05s) × (随机数 - 0.5)，挑剔 0.05s × (随机数 - 0.5)，上下对称', () => {
    const { rates: r } = rates({}, {}, [0.9, 0.5]);
    expect(r.atRate.total).toBeCloseTo(0.36);
    expect(r.atRate.parts.float).toBeCloseTo(0.06);
    // 2 星：上座 ±0.125、挑剔 ±0.05
    const hi = rates({ rest: { star: 2 } }, {}, [1, 1]).rates;
    const lo = rates({ rest: { star: 2 } }, {}, [0, 0]).rates;
    expect(hi.atRate.parts.float).toBeCloseTo(0.125);
    expect(lo.atRate.parts.float).toBeCloseTo(-0.125);
    expect(hi.spRate.parts.float).toBeCloseTo(0.05);
    expect(lo.spRate.parts.float).toBeCloseTo(-0.05);
  });

  it('上座率超过 1.2 的部分按 1.5 折算进经验率；有史前怪石(atToExp)时不折算', () => {
    const a = rates({ agg: { atRate: 1.5 } }).rates;
    expect(a.atRate.total).toBe(1);
    expect(a.expRate.parts.atOverflow).toBeCloseTo(0.4);
    const b = rates({ agg: { atRate: 1.5, atToExp: 1 } }).rates;
    expect(b.expRate.parts.atOverflow).toBeCloseTo(0.6);
  });

  it('负声望：上座率 -80%，截断到 0，没有上座桌', () => {
    const { rates: r } = rates({ rest: { renown: -1 } });
    expect(r.atRate.total).toBe(0);
    expect(r.atRate.parts.renown).toBeCloseTo(-0.8);
    expect(r.seated).toBe(0);
  });

  it('挑剔率软上限：截到 0~1 后超过 30% 的部分只算三分之一，压掉的记成负分项（挑剔顾客调整 2026-10-12）', () => {
    // 2 星：基本 0.1 + 0.02 × 2 = 0.14，浮动 0；加 0.46 → 0.6 → 0.3 + 0.3 ÷ 3 = 0.4
    const { rates: r } = rates({ rest: { star: 2 }, agg: { spRate: 0.46 } });
    expect(r.spRate.total).toBeCloseTo(0.4, 5);
    expect(r.spRate.parts.softCap).toBeCloseTo(-0.2, 5);
    const sum = Object.values(r.spRate.parts).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(r.spRate.total, 5);
    // 超过 1 先截到 1：0.3 + 0.7 ÷ 3
    expect(rates({ rest: { star: 2 }, agg: { spRate: 1 } }).rates.spRate.total).toBeCloseTo(0.5333, 3);
    // 不到 30% 不动，没有 softCap 分项
    const low = rates({ rest: { star: 2 }, agg: { spRate: 0.1 } }).rates.spRate;
    expect(low.total).toBeCloseTo(0.24, 5);
    expect(low.parts.softCap).toBeUndefined();
  });

  it('学菜加挑剔率：本街学会道数 ÷ 本街菜数 × 0.15，不看品级，照样走软上限（收益模型改版 2026-10-15）', () => {
    const newbie = config.cookbookIndex.idsByStreet.get(0)!;
    const half = Object.fromEntries(newbie.slice(0, 23).map((id) => [id, 1]));
    const halfHigh = Object.fromEntries(newbie.slice(0, 23).map((id) => [id, 5]));
    expect(tuning.settlement.spLearnRate).toBe(0.15);
    expect(rates({ cookbooks: half }).rates.spRate.parts.learn).toBeCloseTo((0.15 * 23) / newbie.length, 5);
    expect(rates({ cookbooks: halfHigh }).rates.spRate.parts.learn).toBeCloseTo(
      (0.15 * 23) / newbie.length,
      5,
    );
    // 外街的菜不算
    const other = Object.fromEntries(config.cookbookIndex.idsByStreet.get(1)!.map((id) => [id, 1]));
    expect(rates({ cookbooks: other }).rates.spRate.parts.learn).toBeUndefined();
    // 学满 + 2 星 0.14 + 加成 0.2 = 0.49 → 0.3 + 0.19 ÷ 3
    const all = Object.fromEntries(newbie.map((id) => [id, 1]));
    const r = rates({ rest: { star: 2 }, cookbooks: all, agg: { spRate: 0.2 } }).rates.spRate;
    expect(r.parts.learn).toBeCloseTo(0.15, 5);
    expect(r.total).toBeCloseTo(0.3 + 0.19 / 3, 5);
  });

  it('阿雕作废：挑剔率超过 1 也不再转成银币率', () => {
    const { rates: r } = rates({ rest: { star: 2 }, agg: { spRate: 1, adiao: 1 } });
    expect(r.coinRate.parts.spOverflow).toBeUndefined();
  });

  it('低等级经验加成（问题记录 378）：1 级 +rate，线性减到 maxLevel 为 0；rate 0 不加', () => {
    const at = (level: number, rate: number) => {
      const tuning = {
        ...config.tuning,
        settlement: { ...config.tuning.settlement, newbieExp: { maxLevel: 30, rate } },
      };
      return computeRates(
        buildInput(config, { rest: { level, star: 4 } }),
        buildGlobals(config, tuning, {}),
        sequenceRng([0.5, 0.5]),
      ).rates.expRate;
    };
    expect(at(1, 1).parts.newbie).toBeCloseTo(1);
    expect(at(1, 1).total).toBeCloseTo(1);
    expect(at(15.5, 1).parts.newbie).toBeCloseTo(0.5);
    expect(at(29, 1).parts.newbie).toBeCloseTo(1 / 29);
    expect(at(30, 1).parts.newbie).toBeUndefined();
    expect(at(60, 1).parts.newbie).toBeUndefined();
    expect(at(1, 0).parts.newbie).toBeUndefined();
  });

  it('星潜力：1 星 45%，4 星及以上 0', () => {
    expect(rates({ rest: { star: 1 } }).rates.expRate.parts.starPotential).toBeCloseTo(0.45);
    expect(rates({ rest: { star: 4 } }).rates.expRate.parts.starPotential).toBeUndefined();
  });

  it('收集类加成计入银币率和经验率', () => {
    const { rates: r } = rates({
      agg: {
        plaqueSum: 0.02,
        honorAddCoin: 0.004,
        honorAddExp: 0.004,
        potCoinRate: 0.08,
        potExpRate: 0.8,
      },
    });
    expect(r.coinRate.total).toBeCloseTo(0.104);
    expect(r.expRate.total).toBeCloseTo(1.424);
  });

  it('1 星及以上受天气影响；幸运 = 基础 + 加成 + 天气', () => {
    const { rates: r, flags } = rates(
      { rest: { star: 1, luck: 100 }, agg: { luckValue: 36 } },
      { weather: { atRate: 0.1, luckValue: 10 } },
    );
    expect(r.atRate.total).toBeCloseTo(0.45);
    expect(r.luck.total).toBe(146);
    expect(flags.luckRate).toBeCloseTo(Math.sqrt(3 * 146) / 100);
  });

  it('开关型荣誉和系数', () => {
    const { flags } = rates({
      agg: { husky: 1, ali: 1, spCoinRate: 0.5, squidwardExpRate: 1, roachClearRate: 0.2 },
    });
    // 二哈、阿狸作废（挑剔顾客调整 2026-10-12）
    expect(flags).not.toHaveProperty('husky');
    expect(flags).not.toHaveProperty('ali');
    expect(flags).toMatchObject({
      flute: false,
      spCoinRate: 0.5,
      sqExpRate: 2,
      roachClear: 0.2,
    });
  });
});
