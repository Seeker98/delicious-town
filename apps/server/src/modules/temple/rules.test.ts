import { describe, expect, it } from 'vitest';
import type { MapDef, MissileDef } from '@dt/config';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  exploreAwardNum,
  exploreRate,
  exploreSplit,
  foodsTrial,
  guardianFoods,
  guardianRareCount,
  guardianRareNews,
  guardianScale,
  guardianHp,
  shoot,
  trialBase,
  trialGainCaps,
} from './rules';

const config = testConfig();
const t = config.tuning.temple;
const normal: MissileDef = { attack: [90, 110], hitRate: 0.9, crit: 0.2, critRate: 2 };
const speed: MissileDef = { attack: [5000, 5000], hitRate: 0.96, crit: 0.2, critRate: 2 };
const shot = (def: MissileDef, seq: number[]) =>
  shoot({ def, luckRate: 0, hitBonus: 0, critBonus: 0 }, t, sequenceRng(seq));
const map: MapDef = { rate: 0.75, level: [4, 5], num: [5, 10], mysteriousRate: 0.06, needStrength: 2 };

describe('守护兽（规格书 09 §9.1）', () => {
  it('血量 20000 + 10000 × 星级（试玩修复 14）', () => {
    expect(guardianHp(0, t)).toBe(20000);
    expect(guardianHp(2, t)).toBe(40000);
  });

  it('没命中：伤害 0，不再抽后面的', () => {
    expect(shot(normal, [0.95])).toEqual({
      hit: false,
      crit: false,
      damage: 0,
      ticket: 0,
      map: false,
    });
  });

  it('命中不暴击：伤害 = min + rand(max − min)', () => {
    expect(shot(normal, [0.5, 0.5, 0.5])).toEqual({
      hit: true,
      crit: false,
      damage: 100,
      ticket: 0,
      map: false,
    });
  });

  it('暴击：伤害 × 暴击倍数；礼券 rand[1, 伤害/100]；探险图', () => {
    expect(shot(normal, [0, 0, 0.5, 0, 0.99, 0])).toEqual({
      hit: true,
      crit: true,
      damage: 200,
      ticket: 2,
      map: true,
    });
  });

  it('固定伤害的飞弹不抽伤害', () => {
    expect(shot(speed, [0, 0, 0.99, 0.99])).toEqual({
      hit: true,
      crit: true,
      damage: 10000,
      ticket: 0,
      map: false,
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

  it('击败奖励按血量放大（用户 2026-10-07 定）：倍数 = 血量 ÷ 3 万，1 星是 1 倍；食材个数乘倍数取整', () => {
    expect(guardianScale(1, t)).toBe(1);
    expect(guardianScale(5, t)).toBeCloseTo(70000 / 30000);
    expect(guardianFoods(t, sequenceRng([0]), guardianScale(5, t))).toEqual([
      { level: 3, num: 35 },
      { level: 2, num: 58 },
      { level: 1, num: 128 },
    ]);
  });

  it('神秘食材个数：期望值的整数部分必得，小数部分按概率再给一个', () => {
    expect(guardianRareCount(0.25, sequenceRng([0.2]))).toBe(1);
    expect(guardianRareCount(0.25, sequenceRng([0.3]))).toBe(0);
    expect(guardianRareCount(1.17, sequenceRng([0.5]))).toBe(1);
    expect(guardianRareCount(1.17, sequenceRng([0.1]))).toBe(2);
    expect(guardianRareCount(2, sequenceRng([0]))).toBe(2);
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

  it('普通食材总数 = rand[1, max − min] + min', () => {
    expect(exploreAwardNum(map, sequenceRng([0]))).toBe(6);
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

describe('守护兽神秘食材的新闻（集束飞弹那次的遗留：同一种掉了几个，每个都发一条）', () => {
  it('同一种合成一条，两个以上带 num；按第一次掉出的顺序', () => {
    expect(guardianRareNews([7101, 7102, 7101])).toEqual([{ foodsId: 7101, num: 2 }, { foodsId: 7102 }]);
    expect(guardianRareNews([7103])).toEqual([{ foodsId: 7103 }]);
    expect(guardianRareNews([])).toEqual([]);
  });
});
