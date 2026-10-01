import { describe, expect, it } from 'vitest';
import { luckRate, sequenceRng } from '@dt/shared';
import type { EquipDef, SuitDef } from '@dt/config';
import { testConfig } from '../../../test/config';
import {
  activeSuits,
  attrSeq,
  attrSummary,
  gemLevelUp,
  rollEquipAttrs,
  rollStress,
  stressGain,
  stressRate,
  suitAggEffects,
  suitPct,
} from './rules';

const t = testConfig().tuning.equip;
const range = (min: number, max: number): [number, number] => [min, max];

describe('生成（规格书 07 §7.7）', () => {
  it('部位属性顺序：主属性在第一位', () => {
    expect(attrSeq(1)).toEqual(['cook', 'cutting', 'fire', 'season', 'luck', 'creatives']);
    expect(attrSeq(5)).toEqual(['creatives', 'cook', 'cutting', 'fire', 'season', 'luck']);
    expect(() => attrSeq(6)).toThrow();
  });

  it('固定属性原样生成', () => {
    const def: EquipDef = {
      part: 1,
      essence: 1,
      hole: 0,
      maxHole: 0,
      minLevel: 0,
      suitId: 0,
      total: null,
      ranges: { cook: 3, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 },
      stressTable: [],
    };
    expect(rollEquipAttrs(def, sequenceRng([0.9]))).toEqual({
      cook: 3,
      cutting: 0,
      fire: 0,
      season: 0,
      creatives: 0,
      luck: 0,
    });
  });

  it('有 total：按部位顺序在范围内随机、从 total 里扣，扣完后面为 0，最后一项取剩余', () => {
    const def: EquipDef = {
      part: 3,
      essence: 12,
      hole: 1,
      maxHole: 3,
      minLevel: 13,
      suitId: 5,
      total: 25,
      stressTable: [],
      ranges: {
        cook: range(0, 25),
        cutting: range(0, 25),
        fire: range(0, 25),
        season: range(0, 25),
        creatives: range(0, 25),
        luck: range(0, 25),
      },
    };
    // 锅的顺序：火候 调味 厨艺 刀工 幸运 创意；rand = ⌊0.4×26⌋ = 10
    const a = rollEquipAttrs(def, sequenceRng([0.4]));
    expect(a).toEqual({ fire: 10, season: 10, cook: 5, cutting: 0, luck: 0, creatives: 0 });
    // 每项都很小时最后一项拿走剩余
    const b = rollEquipAttrs(def, sequenceRng([0.05]));
    expect(b.fire + b.season + b.cook + b.cutting + b.luck).toBe(5);
    expect(b.creatives).toBe(20);
  });
});

describe('强化（规格书 07 §7.7）', () => {
  it('成功率 = 基础 + 幸运率/(等级+1)/4 + 天气 + 连续失败×1%', () => {
    const r = stressRate(2, 100, 0.1, 3, t);
    expect(r.base).toBeCloseTo(0.64);
    expect(r.luck).toBeCloseTo(luckRate(100) / 3 / 4);
    expect(r.weather).toBe(0.1);
    expect(r.floor).toBeCloseTo(0.03);
    expect(r.total).toBeCloseTo(0.64 + luckRate(100) / 12 + 0.1 + 0.03);
  });

  it('幸运标记：只靠幸运才成功；保底标记：只靠连续失败才成功；强化石必成', () => {
    const rate = { base: 0.5, luck: 0.1, weather: 0, floor: 0.1, total: 0.7 };
    expect(rollStress(rate, false, sequenceRng([0.45]))).toEqual({
      success: true,
      lucky: false,
      floor: false,
    });
    expect(rollStress(rate, false, sequenceRng([0.55]))).toEqual({
      success: true,
      lucky: true,
      floor: false,
    });
    expect(rollStress(rate, false, sequenceRng([0.65]))).toEqual({ success: true, lucky: true, floor: true });
    expect(rollStress(rate, false, sequenceRng([0.75]))).toEqual({
      success: false,
      lucky: false,
      floor: false,
    });
    expect(rollStress(rate, true, sequenceRng([0.99]))).toEqual({
      success: true,
      lucky: false,
      floor: false,
    });
  });

  it('选属性：按顺序每项 50%，都没选中取最后一项；增量固定为表里两档之差（问题记录 120）', () => {
    // 刀：刀工 火候 调味 厨艺 幸运 创意；0.7 跳过刀工，0.3 选中火候
    expect(stressGain(2, 4, sequenceRng([0.7, 0.3]))).toEqual({ attr: 'fire', val: 4 });
    // 都没选中 → 创意
    expect(stressGain(2, 7, sequenceRng([0.9]))).toEqual({ attr: 'creatives', val: 7 });
    // 增量可以是 0
    expect(stressGain(1, 0, sequenceRng([0.1])).val).toBe(0);
  });
});

describe('宝石升阶（规格书 07 §7.7）', () => {
  it('每组独立：成功 / 幸运补救 / 失败', () => {
    // 1 阶成功率 0.95 − 0.18 = 0.77；幸运率 0.2
    const r = gemLevelUp(3, 1, 0, 0.2, t, sequenceRng([0.5, 0.9, 0.1, 0.9, 0.9]));
    expect(r).toEqual({ success: 2, lucky: 1, fail: 1 });
  });
});

describe('套装（规格书 20 §20.15）', () => {
  const suits = new Map<number, SuitDef>([
    [
      100,
      {
        id: 100,
        name: '真爱套装',
        maxNum: 5,
        tiers: [
          { need: 3, desc: '', effects: { atRate: 0.05, spRate: 0.03 } },
          { need: 5, desc: '', effects: { coinRate: 0.05, luckValue: 52 } },
        ],
      },
    ],
    [
      6,
      {
        id: 6,
        name: '裁决套装',
        maxNum: 3,
        tiers: [{ need: 2, desc: '', effects: { cookPct: 0.05, seasonPct: 0.06 } }],
      },
    ],
  ]);

  it('按件数激活档位，达到的档位都生效；0 / 90 / 99 和未知套装不算', () => {
    const r = activeSuits([100, 100, 100, 0, 90], suits);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ count: 3, active: [true, false] });
    expect(activeSuits([100, 100, 100, 100, 100], suits)[0]!.active).toEqual([true, true]);
    expect(activeSuits([99, 777], suits)).toEqual([]);
  });

  it('进加成汇总的键不含 Pct、进攻 / 防守、探险', () => {
    expect(
      suitAggEffects({
        atRate: 0.08,
        cookPct: 0.1,
        attackFire: 0.08,
        defendCutting: 0.04,
        exploreSuccessRate: 0.02,
        operFoodsAddRate: 0.05,
      }),
    ).toEqual({ atRate: 0.08, operFoodsAddRate: 0.05 });
  });

  it('属性百分比只取激活的档位', () => {
    expect(suitPct(activeSuits([6, 6], suits))).toEqual({ cook: 0.05, cutting: 0, fire: 0, season: 0.06 });
    expect(suitPct(activeSuits([6], suits))).toEqual({ cook: 0, cutting: 0, fire: 0, season: 0 });
  });
});

describe('属性和厨力（规格书 20 §20.18）', () => {
  it('(加点 + 厨具) × (1 + 套装百分比) 四舍五入；厨力 = 五项之和 + ⌊幸运/2⌋', () => {
    const r = attrSummary(
      { cook: 5, cutting: 0, fire: 3, season: 0, creatives: 0, luck: 10 },
      { cook: 10, cutting: 4, fire: 0, season: 6, creatives: 2, luck: 7 },
      { cook: 0.1, cutting: 0, fire: 0, season: 0.06 },
    );
    expect(r.total).toEqual({ cook: 17, cutting: 4, fire: 3, season: 6, creatives: 2, luck: 17 });
    expect(r.power).toBe(17 + 4 + 3 + 6 + 2 + 8);
  });
});
