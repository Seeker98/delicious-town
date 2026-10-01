import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { buildGlobals, buildInput, type InputPatch } from './globals';
import { computeRates } from './rates';
import type { SettleGlobals } from './types';

const config = testConfig();
const rates = (patch: InputPatch = {}, g: Partial<SettleGlobals> = {}, rng = [0.5, 0.65]) =>
  computeRates(buildInput(config, patch), buildGlobals(config, config.tuning, g), sequenceRng(rng));

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

  it('食谱加成：各品级食谱数 × r_L × L', () => {
    const ids = config.cookbookIndex.allIds;
    const cookbooks: Record<number, number> = {};
    for (const id of ids.slice(0, 10)) cookbooks[id] = 1;
    for (const id of ids.slice(10, 15)) cookbooks[id] = 7;
    const { rates: r } = rates({ cookbooks });
    expect(r.atRate.parts.cookbook).toBeCloseTo(10 * 0.000098 + 5 * 0.00011 * 7);
  });

  it('浮动：(0.3 + 0.1s) × (随机数 - 0.5)', () => {
    const { rates: r } = rates({}, {}, [0.9, 0.65]);
    expect(r.atRate.total).toBeCloseTo(0.42);
    expect(r.atRate.parts.float).toBeCloseTo(0.12);
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

  it('阿刁：挑剔率超过 1 的部分一半转成银币率', () => {
    const { rates: r } = rates({ rest: { star: 2 }, agg: { spRate: 1, adiao: 1 } });
    expect(r.spRate.total).toBe(1);
    expect(r.coinRate.parts.spOverflow).toBeCloseTo(0.11);
  });

  it('银币转经验：银币率 ×1.5 加到经验率，银币率清零', () => {
    const { rates: r } = rates({ rest: { cteOn: true }, agg: { coinRate: 0.2 } });
    expect(r.coinRate.total).toBe(0);
    expect(r.expRate.parts.cte).toBeCloseTo(0.3);
    expect(r.expRate.total).toBeCloseTo(0.9);
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
        paintingExpRate: 0.8,
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
    expect(flags).toMatchObject({
      husky: true,
      ali: true,
      flute: false,
      spCoinRate: 0.5,
      sqExpRate: 2,
      roachClear: 0.2,
    });
  });
});

describe('星愿加成（4E-1 裁定 11）', () => {
  it('星愿的挑剔率计入', () => {
    const { rates: r } = rates({}, { bless: { spRate: 0.03 } });
    expect(r.spRate.parts.bless).toBe(0.03);
  });
});
