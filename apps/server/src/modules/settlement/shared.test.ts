import { describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { computeEffectAgg } from '../effects/aggregate';
import { toSettleInput } from './globals';
import { strengthGain } from './strength';

const config = testConfig();
const tuning = config.tuning;

describe('共用纯函数（快速模拟设计 §4.2）', () => {
  it('toSettleInput：补全旧的食谱计数；品级换成 Uint8Array 视图（不复制）', () => {
    const levels = new Uint8Array([0, 2, 1]);
    const input = toSettleInput({
      rest: {
        id: 1,
        level: 3,
        star: 0,
        oil: 10,
        oilMax: 100,
        coin: 5,
        streetId: 0,
        renown: 0,
        luck: 2,
        cteOn: false,
        cookfoodsFlag: 0,
      },
      tables: [],
      levels,
      counts: {},
      agg: { atRate: 0.1 },
      special: null,
      cupboard: null,
      now: new Date('2026-10-02T00:00:00Z'),
    });
    expect(input.counts).toEqual({ learned: 0, grade: Array(11).fill(0), street: {} });
    expect(input.levels).toEqual(levels);
    expect(input.levels).not.toBe(levels);
    expect(input.agg).toEqual({ atRate: 0.1 });
  });

  it('computeEffectAgg：过期的来源不算', () => {
    const now = new Date('2026-10-02T00:00:00Z');
    const r = computeEffectAgg(
      [
        { sourceType: 'device', sourceId: 1, effects: { atRate: 0.1 }, expiresAt: null },
        {
          sourceType: 'device',
          sourceId: 2,
          effects: { atRate: 0.5 },
          expiresAt: new Date(now.getTime() - 1),
        },
      ],
      new Set(),
      config,
      tuning,
      now,
    );
    expect(r.agg.atRate).toBeCloseTo(0.1);
  });

  it('strengthGain：满了返回 null；没满按幸运和倍率给', () => {
    expect(strengthGain({ strength: 10, strength_max: 10, luck: 0 }, {}, tuning, seededRng(1))).toBeNull();
    const g = strengthGain(
      { strength: 0, strength_max: 10, luck: 0 },
      { autoReStrength: 3 },
      tuning,
      seededRng(1),
    )!;
    expect(g.cap).toBe(10);
    expect([tuning.strength.regen * 3, tuning.strength.luckyRegen * 3]).toContain(g.add);
  });
});

describe('结算不改食谱品级（终审 I-3：toSettleInput 现在给的是视图，不再复制）', () => {
  it('跑一轮结算后，传进去的品级字节不变', async () => {
    const { buildGlobals, buildInput } = await import('./globals');
    const { settleRestaurant } = await import('./settle');
    const cb = [...config.cookbooks.values()][0]!;
    const input = buildInput(config, { cookbooks: { [cb.id]: 2 } });
    const before = Array.from(input.levels);
    settleRestaurant(input, buildGlobals(config, tuning), seededRng(3));
    expect(Array.from(input.levels)).toEqual(before);
  });
});
