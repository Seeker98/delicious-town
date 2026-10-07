import { describe, expect, it } from 'vitest';
import type { MysteriousCookbook } from '@dt/config';
import { buildPool, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  addProficiency,
  appraisePick,
  appraiseRate,
  bobChance,
  cookDish,
  forgetCount,
  forgetMcChance,
  gradeOf,
  learnRate,
  pickSome,
  roadRate,
  stealRate,
  studentStar,
  tasteRecipeRate,
  tasteStrength,
  tasteTickets,
  teacherStar,
  trialRestExp,
  type CookInput,
} from './rules';

const config = testConfig();
const t = config.tuning.mysterious;
const dish = (patch: Partial<MysteriousCookbook> = {}): MysteriousCookbook => ({
  id: 1,
  name: '秘·测试',
  level: 4,
  road: 1,
  nutritive: 100,
  coin: 1000,
  odds: 1,
  taste: [],
  appraisable: true,
  foods: [1, 2, 3],
  ...patch,
});
const input = (patch: Partial<CookInput> = {}): CookInput => ({
  mc: dish(),
  cookNum: 1,
  curlevel: 1,
  trialWorth: 0,
  star: 1,
  luckRate: 0,
  goldRate: 0,
  numRate: 0,
  roadRate: 0,
  power: 0,
  coinAdd: 0,
  humanSon: false,
  cookie: false,
  ...patch,
});

describe('品级（规格书 04 §4.5，设计文档 裁定 16）', () => {
  it('按区间判定，≥1.25 为佳肴；[1, 1.25) 不会直接判佳肴', () => {
    expect(gradeOf(0, t.gradeBounds)).toBe(1);
    expect(gradeOf(0.5, t.gradeBounds)).toBe(2);
    expect(gradeOf(1.0, t.gradeBounds)).toBe(4);
    expect(gradeOf(1.1, t.gradeBounds)).toBe(5);
    expect(gradeOf(1.2499, t.gradeBounds)).toBe(6);
    expect(gradeOf(1.25, t.gradeBounds)).toBe(7);
    expect(gradeOf(3.5, t.gradeBounds)).toBe(7);
  });
});

describe('cookDish', () => {
  it('没有加成：rand 0.9 → 上品；份数 = 360×(1+0.57)；每份 = 营养×1.57；熟练度 = 品级×份数/200', () => {
    const r = cookDish(input(), t, sequenceRng([0.9, 0.5, 0.5]));
    expect(r).toEqual({ grade: 3, luck: false, num: 565, price: 157, duelPrice: 157, exp: 8 });
  });

  it('6 级菜份数打折；加成把品级抬到佳肴时标记幸运；熟练度、试炼价值、人子、饼干、名画都算进每份价值', () => {
    const r = cookDish(
      input({
        mc: dish({ level: 6 }),
        cookNum: 5,
        curlevel: 3,
        trialWorth: 10,
        star: 4,
        goldRate: 0.4,
        numRate: 0.2,
        roadRate: 0.1,
        power: 200,
        coinAdd: 3,
        humanSon: true,
        cookie: true,
      }),
      t,
      // 品级 0.9；份数折扣 0.70+0.4×0.25=0.8；份数系数 0.98+0.5×0.14；厨力项 0.05×0.5；人子 rand[1,2]→1；饼干 rand[1,3]→3
      sequenceRng([0.9, 0.4, 0.5, 0.5, 0, 0.99]),
    );
    expect(r.grade).toBe(7);
    expect(r.luck).toBe(true);
    // 1440 × 2.05 × (1 + 0.1 + 0.2 + 0.025) = 3911.4
    expect(r.num).toBe(3911);
    // ⌊100 × 2.05 × (1 + 0.08 + 0.1)⌋ + 1 + 3 + 3
    expect(r.price).toBe(248);
    // 对决用的每份价值不吃试炼价值（用户 2026-10-07 定）：⌊100 × 2.05 × (1 + 0.08)⌋ + 1 + 3 + 3
    expect(r.duelPrice).toBe(228);
    expect(r.exp).toBe(Math.floor((7 * 3911) / 200));
  });
});

describe('熟练度（规格书 20 §20.4，计划裁定 5）', () => {
  const table = config.mcProficiency;
  it('累计值达到本级 expNext 升级，可以连升；满级停', () => {
    expect(addProficiency(1, 0, 199, table)).toEqual({ curlevel: 1, curexp: 199 });
    expect(addProficiency(1, 0, 800, table)).toEqual({ curlevel: 3, curexp: 800 });
    expect(addProficiency(9, 16000, 5000, table)).toEqual({ curlevel: 10, curexp: 21000 });
    expect(addProficiency(10, 21000, 100, table)).toEqual({ curlevel: 10, curexp: 21100 });
  });
});

describe('道份数加成（规格书 20 §20.4）', () => {
  it('同道每道 2%（上限 30%），他道每道 0.5%（上限 10%）', () => {
    const same = (n: number) => Array.from({ length: n }, () => dish({ road: 2 }));
    const other = (n: number) => Array.from({ length: n }, () => dish({ road: 3 }));
    expect(roadRate(2, [...same(3), ...other(5)], t)).toBeCloseTo(0.085, 10);
    expect(roadRate(2, [...same(20), ...other(30)], t)).toBeCloseTo(0.4, 10);
    expect(roadRate(2, [], t)).toBe(0);
  });
});

describe('海绵宝宝、试炼经验', () => {
  it('6 级菜必中，否则 0.0002 × 营养 × 批数', () => {
    expect(bobChance(dish({ level: 6 }), 1, t)).toBe(1);
    expect(bobChance(dish({ nutritive: 50 }), 10, t)).toBeCloseTo(0.1, 10);
  });
  it('试炼经验 = 份数 × 餐厅等级 × 试炼经验 / 1200', () => {
    expect(trialRestExp(1200, 30, 10)).toBe(300);
  });
});

describe('鉴定（规格书 04 §4.3）', () => {
  it('成功率 = 道具 + 加成 + 幸运/8', () => {
    expect(appraiseRate({ min: 1, max: 6, rate: 0.28, num: 1 }, 0.2, 0.4)).toBeCloseTo(0.53, 10);
  });

  it('星神之书：第一次抽到低于 5 级时重抽，取等级高的并标记眷恋', () => {
    const pool = buildPool([dish({ id: 10, level: 3 }), dish({ id: 11, level: 5 })], (m) => m.odds);
    expect(appraisePick(pool, true, t, sequenceRng([0.1, 0.9]))).toMatchObject({
      mc: { id: 11 },
      blessed: true,
    });
    expect(appraisePick(pool, false, t, sequenceRng([0.1, 0.9]))).toMatchObject({
      mc: { id: 10 },
      blessed: false,
    });
    expect(appraisePick(pool, true, t, sequenceRng([0.1, 0.1]))).toMatchObject({
      mc: { id: 10 },
      blessed: false,
    });
    expect(appraisePick(pool, true, t, sequenceRng([0.9]))).toMatchObject({ mc: { id: 11 }, blessed: false });
  });
});

describe('教室（规格书 04 §4.7）', () => {
  it('学：0.9（思想者 1）+ 幸运/5；偷：0.4 - 等级×0.02（思想者 +0.05）+ 幸运/5', () => {
    expect(learnRate(false, 0.1, t)).toBeCloseTo(0.92, 10);
    expect(learnRate(true, 0, t)).toBe(1);
    expect(stealRate(5, false, 0.1, t)).toBeCloseTo(0.32, 10);
    expect(stealRate(5, true, 0, t)).toBeCloseTo(0.35, 10);
  });

  it('降级 等级×2+1 道（问题记录 424）；4 级起才可能遗忘特色菜，概率 等级×2%', () => {
    expect(forgetCount(4, t)).toBe(9);
    expect(forgetCount(1, t)).toBe(3);
    expect(t.forgetGrades).toBe(1);
    expect(forgetMcChance(3, t)).toBe(0);
    expect(forgetMcChance(4, t)).toBeCloseTo(0.08, 10);
    expect(forgetMcChance(6, t)).toBeCloseTo(0.12, 10);
  });

  it('星级门槛：老师 max(1, ⌊(等级-1)/2⌋)，学生 ⌊(等级-1)/2⌋+1', () => {
    expect([1, 4, 5, 6].map(teacherStar)).toEqual([1, 1, 2, 2]);
    expect([1, 4, 6].map(studentStar)).toEqual([1, 2, 3]);
  });

  it('pickSome：不重复，最多 n 个，不够时全给', () => {
    expect(pickSome([1, 2, 3, 4, 5], 2, sequenceRng([0]))).toEqual([1, 2]);
    expect(pickSome([1, 2], 5, sequenceRng([0.5])).sort()).toEqual([1, 2]);
    const r = pickSome([1, 2, 3, 4, 5], 3, sequenceRng([0.99, 0.5, 0.2]));
    expect(new Set(r).size).toBe(3);
  });
});

describe('品尝（规格书 13 §13.6）', () => {
  it('体力 = 每份价值（非好友减半）；神秘食谱概率；店主礼券 rand[1, 体力/(10×(0星?2:1))+1]', () => {
    expect(tasteStrength(157, true)).toBe(157);
    expect(tasteStrength(157, false)).toBe(78);
    expect(tasteRecipeRate(3, 0.1, t)).toBeCloseTo(0.0266, 10);
    expect(tasteTickets(157, 2, sequenceRng([0.99]))).toBe(16);
    expect(tasteTickets(157, 0, sequenceRng([0.99]))).toBe(8);
  });
});
