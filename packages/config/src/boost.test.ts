import { describe, expect, it } from 'vitest';
import { boostDefOf } from '@dt/shared';
import { applyBoosts } from './boost';
import { buildBundle } from './build';
import { createGameConfig } from './runtime';
import { resolveShardSettings } from './shard';
import { defaultDataDir, readSourceDir } from './source';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);
const base = resolveShardSettings(config, {});

describe('applyBoosts（148-4 设计 §6.1）', () => {
  it('没有加成时原样返回', () => {
    expect(applyBoosts(base, [])).toBe(base);
  });
  it('单项相乘；体力恢复两条路径一起乘；不改传入对象', () => {
    const s = applyBoosts(base, [
      [
        { key: 'exp', factor: 2 },
        { key: 'strength', factor: 2 },
      ],
    ]);
    expect(s.tuning.settlement.expMultiplier).toBe(base.tuning.settlement.expMultiplier * 2);
    expect(s.tuning.strength.regen).toBe(base.tuning.strength.regen * 2);
    expect(s.tuning.strength.luckyRegen).toBe(base.tuning.strength.luckyRegen * 2);
    expect(base.tuning.settlement.expMultiplier).toBe(config.tuning.settlement.expMultiplier);
  });
  it('多个活动连乘后夹到范围内', () => {
    const s = applyBoosts(base, [[{ key: 'exp', factor: 3 }], [{ key: 'exp', factor: 3 }]]);
    expect(s.tuning.settlement.expMultiplier).toBe(base.tuning.settlement.expMultiplier * 5);
    const p = applyBoosts(base, [
      [{ key: 'marketPrice', factor: 0.5 }],
      [{ key: 'marketPrice', factor: 0.5 }],
    ]);
    expect(p.tuning.market.priceFactor).toBe(0.5);
  });
  it('概率类不超过 1；整数项四舍五入', () => {
    const s = applyBoosts(base, [
      [
        { key: 'equipStress', factor: 1.25 },
        { key: 'sellRate', factor: 1.3 },
      ],
    ]);
    expect(s.tuning.equip.baseRate).toBeLessThanOrEqual(1);
    expect(s.tuning.shop.sellRate).toBeCloseTo(Math.min(1, base.tuning.shop.sellRate * 1.3));
    const y = applyBoosts(base, [[{ key: 'yardYield', factor: 1.5 }]]);
    expect(y.tuning.yard.yieldPerLevel).toBe(Math.round(base.tuning.yard.yieldPerLevel * 1.5));
  });
  it('新数值默认 1', () => {
    expect(base.tuning.settlement.coinMultiplier).toBe(1);
    expect(base.tuning.market.priceFactor).toBe(1);
  });
});

describe('backlog 148-4：上限和取整不把区服调过的数值压低', () => {
  const withTuning = (patch: Record<string, Record<string, number>>) => {
    const s = structuredClone(base);
    for (const [sec, kv] of Object.entries(patch))
      Object.assign((s.tuning as unknown as Record<string, Record<string, number>>)[sec]!, kv);
    return s;
  };
  it('区服把概率调到 1 以上时，加成不会把它压回 1', () => {
    const s = applyBoosts(withTuning({ equip: { baseRate: 1.2 } }), [[{ key: 'equipStress', factor: 1.1 }]]);
    expect(s.tuning.equip.baseRate).toBe(1.2);
  });
  it('整数项原值是 0（关掉加产）时保持 0，不会变成 1', () => {
    const s = applyBoosts(withTuning({ yard: { yieldPerLevel: 0 } }), [[{ key: 'yardYield', factor: 2 }]]);
    expect(s.tuning.yard.yieldPerLevel).toBe(0);
  });
  it('体力恢复的最小倍数是 1.5：更小的倍数四舍五入后恢复量不变', () => {
    expect(boostDefOf('strength')?.min).toBe(1.5);
  });
});
