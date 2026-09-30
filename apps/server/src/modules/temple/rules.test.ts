import { describe, expect, it } from 'vitest';
import type { MapDef, MissileDef, MysteriousCookbook } from '@dt/config';
import { buildPool, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  exploreAwardNum,
  exploreRate,
  exploreSplit,
  foodsTrial,
  guardianFoods,
  guardianHp,
  inFeedHours,
  krakenFavor,
  krakenTarget,
  pickSeeds,
  pickShopSlots,
  relationOf,
  seedCount,
  shoot,
  trialBase,
  trialGainCaps,
} from './rules';

const config = testConfig();
const t = config.tuning.temple;
const normal: MissileDef = { attack: [90, 110], hitRate: 0.9, crit: 0.2, critRate: 2 };
const speed: MissileDef = { attack: [5000, 5000], hitRate: 0.96, crit: 0.2, critRate: 2 };
const shot = (def: MissileDef, seq: number[], sealRate = 0) =>
  shoot({ def, luckRate: 0, hitBonus: 0, critBonus: 0, sealRate }, t, sequenceRng(seq));
const map: MapDef = { rate: 0.75, level: [4, 5], num: [5, 10], mysteriousRate: 0.06, needStrength: 2 };
const dish = (patch: Partial<MysteriousCookbook>): MysteriousCookbook => ({
  id: 1,
  name: 'x',
  level: 3,
  road: 1,
  nutritive: 10,
  coin: 1,
  odds: 1,
  taste: [],
  appraisable: true,
  foods: [],
  ...patch,
});

describe('守护兽（规格书 09 §9.1）', () => {
  it('血量 10000 + 5000 × 星级', () => {
    expect(guardianHp(0, t)).toBe(10000);
    expect(guardianHp(2, t)).toBe(20000);
  });

  it('没命中：伤害 0，不再抽后面的', () => {
    expect(shot(normal, [0.95])).toEqual({
      hit: false,
      crit: false,
      damage: 0,
      ticket: 0,
      map: false,
      seal: false,
    });
  });

  it('命中不暴击：伤害 = min + rand(max − min)', () => {
    expect(shot(normal, [0.5, 0.5, 0.5])).toEqual({
      hit: true,
      crit: false,
      damage: 100,
      ticket: 0,
      map: false,
      seal: false,
    });
  });

  it('暴击：伤害 × 暴击倍数；礼券 rand[1, 伤害/100]；探险图', () => {
    expect(shot(normal, [0, 0, 0.5, 0, 0.99, 0])).toEqual({
      hit: true,
      crit: true,
      damage: 200,
      ticket: 2,
      map: true,
      seal: false,
    });
  });

  it('固定伤害的飞弹不抽伤害；有捕梦网时暴击可能掉玉玺', () => {
    expect(shot(speed, [0, 0, 0.99, 0.99, 0], 0.32)).toEqual({
      hit: true,
      crit: true,
      damage: 10000,
      ticket: 0,
      map: false,
      seal: true,
    });
  });

  it('击败奖励：3、2、1 级各 ⌊60/等级⌋ + rand(10) − 5 个', () => {
    expect(guardianFoods(t, sequenceRng([0]))).toEqual([
      { level: 3, num: 15 },
      { level: 2, num: 25 },
      { level: 1, num: 55 },
    ]);
    expect(guardianFoods(t, sequenceRng([0.99]))).toEqual([
      { level: 3, num: 24 },
      { level: 2, num: 34 },
      { level: 1, num: 64 },
    ]);
  });
});

describe('探险（规格书 09 §9.2）', () => {
  it('成功率：欲望之针补一半失败率；天气迷路率（有针减半）；套装加成只加不减', () => {
    expect(exploreRate(map, { needle: false, lostRate: 0, suitRate: 0 })).toBeCloseTo(0.75, 10);
    expect(exploreRate(map, { needle: true, lostRate: 0, suitRate: 0 })).toBeCloseTo(0.875, 10);
    expect(exploreRate(map, { needle: false, lostRate: 0.2, suitRate: 0 })).toBeCloseTo(0.55, 10);
    expect(exploreRate(map, { needle: true, lostRate: 0.2, suitRate: 0 })).toBeCloseTo(0.775, 10);
    expect(exploreRate(map, { needle: false, lostRate: 0, suitRate: 0.1 })).toBeCloseTo(0.85, 10);
    expect(exploreRate(map, { needle: false, lostRate: 0, suitRate: -0.1 })).toBeCloseTo(0.75, 10);
  });

  it('普通食材总数 = rand[1, max − min] + min（星光之钥 +2）', () => {
    expect(exploreAwardNum(map, false, sequenceRng([0]))).toBe(6);
    expect(exploreAwardNum(map, true, sequenceRng([0]))).toBe(8);
  });

  it('按等级分配：4 级拿 75%，其他 25%，照源码取整（计划裁定 1）', () => {
    expect(exploreSplit(map, 6)).toEqual([
      { level: 5, num: 1 },
      { level: 4, num: 4 },
    ]);
    expect(exploreSplit(map, 7)).toEqual([
      { level: 5, num: 1 },
      { level: 4, num: 5 },
    ]);
    expect(exploreSplit({ ...map, level: [3, 4] }, 6)).toEqual([
      { level: 4, num: 4 },
      { level: 3, num: 1 },
    ]);
  });
});

describe('试炼（规格书 09 §9.4）', () => {
  it('getTrial：0.05 + 创意/750（150 封顶）+ √(超出部分)/100，总和不超过 0.6', () => {
    expect(trialBase(0, t)).toBeCloseTo(0.05, 10);
    expect(trialBase(150, t)).toBeCloseTo(0.25, 10);
    expect(trialBase(250, t)).toBeCloseTo(0.35, 10);
    expect(trialBase(10150, t)).toBeCloseTo(0.6, 10);
  });

  it('getFoodsTrial：食材比菜高的等级和稀有度加成功率', () => {
    expect(foodsTrial(3, { level: 5, odds: 50 }, { level: 4, odds: 120 })).toBeCloseTo(0.05125, 10);
  });

  it('加成上限：价值 n、经验 m 按主辅是否稀有', () => {
    expect(trialGainCaps(true, true)).toEqual({ n: 2, m: 4 });
    expect(trialGainCaps(true, false)).toEqual({ n: 1, m: 3 });
    expect(trialGainCaps(false, true)).toEqual({ n: 0, m: 2 });
    expect(trialGainCaps(false, false)).toEqual({ n: 0, m: 1 });
  });
});

describe('克拉肯（规格书 09 §9.5）', () => {
  const pool = buildPool(
    config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level <= 5),
    (m) => m.odds,
  );

  it('今天想吃的菜：同区服同日稳定，1~5 级可鉴定', () => {
    const a = krakenTarget(pool, 7, '2026-09-30');
    expect(krakenTarget(pool, 7, '2026-09-30').id).toBe(a.id);
    expect(a.level).toBeLessThanOrEqual(5);
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
    expect(new Set(days.map((d) => krakenTarget(pool, 7, d).id)).size).toBeGreaterThan(1);
  });

  it('投喂时段左闭右开', () => {
    expect([11, 13, 14, 17, 20, 21, 0].map((h) => inFeedHours(h, t.krakenHours))).toEqual([
      true,
      true,
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it('关系：同一道菜 / 同道 / 其他', () => {
    const target = dish({ id: 5, road: 2 });
    expect(relationOf(dish({ id: 5, road: 2 }), target)).toBe('same');
    expect(relationOf(dish({ id: 6, road: 2 }), target)).toBe('road');
    expect(relationOf(dish({ id: 7, road: 3 }), target)).toBe('other');
  });

  it('好感度：rand(init) − trunc(k × init)，0 记 1，不超过 init；同菜加幸运', () => {
    const base = { level: 4, grade: 1, luckRate: 0 };
    // init = ⌊√(10×50×2.4)/12⌋ = 2；k = 0 → favor 0 → 1
    expect(
      krakenFavor({ ...base, num: 10, price: 50, grade: 3, relation: 'same' }, t, sequenceRng([0])),
    ).toEqual({
      init: 2,
      favor: 1,
      luck: 0,
    });
    // 其他：init = ⌊√(100×100×0.5)/12⌋ = 5；k = 0.2 → 0 − 1 = −1
    expect(
      krakenFavor({ ...base, num: 100, price: 100, relation: 'other' }, t, sequenceRng([0])),
    ).toMatchObject({
      init: 5,
      favor: -1,
    });
    // 同道：init 8，k = 0.1 → trunc(0.8) = 0；rand(8) = 7
    expect(
      krakenFavor({ ...base, num: 100, price: 100, relation: 'road' }, t, sequenceRng([0.99])),
    ).toMatchObject({
      init: 8,
      favor: 7,
    });
    // 同菜 7 品：init 12，k = −0.36 → trunc(−4.32) = −4；11 + 4 = 15 → 封顶 12
    expect(
      krakenFavor({ ...base, num: 100, price: 100, grade: 7, relation: 'same' }, t, sequenceRng([0.99, 0])),
    ).toMatchObject({ init: 12, favor: 12 });
    // 同菜幸运：rand(⌊12 × 1 / 5⌋ = 2) = 1
    expect(
      krakenFavor(
        { ...base, num: 100, price: 100, relation: 'same', luckRate: 1 },
        t,
        sequenceRng([0.5, 0.5]),
      ),
    ).toEqual({ init: 12, favor: 7, luck: 1 });
  });

  it('种子数 = ⌊√max(0, 好感)⌋ + 2（计划裁定 4）', () => {
    expect([-3, 1, 16, 35].map(seedCount)).toEqual([2, 3, 6, 7]);
  });

  it('抽种子合并计数；触手商店抽 n 格', () => {
    const r = pickSeeds(config.seedPool, 3, sequenceRng([0]));
    expect([...r.values()]).toEqual([3]);
    expect(pickShopSlots(pool, 6, sequenceRng([0.3, 0.6]))).toHaveLength(6);
  });
});
