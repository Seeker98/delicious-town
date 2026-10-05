import { describe, expect, it } from 'vitest';
import {
  applyForget,
  applyLearn,
  foodsNeedFor,
  gradeOf,
  padLevels,
  planLearn,
  setGrade,
  streetTargetGrade,
} from './rules';
import { FOODS } from '@dt/config';
import { fid } from '../../../test/items';

const level = (id: number) => ({ 1: 1, 2: 2, 3: 3, 7: 7 })[id] ?? 1;
const stock = (m: Record<number, number>) => (id: number) => m[id] ?? 0;
const need = [
  { foodsId: 1, num: 1 },
  { foodsId: 2, num: 2 },
  { foodsId: 3, num: 1 },
];

describe('planLearn（规格书 03 §3.3）', () => {
  it('都够：普通学习', () => {
    expect(planLearn(need, stock({ 1: 1, 2: 2, 3: 1 }), level)).toEqual({ kind: 'normal', consume: need });
  });
  it('恰好缺一种：先扣光已有的，缺口用同级万能食材（masterBase + 等级）', () => {
    const p = planLearn(need, stock({ 1: 1, 2: 1, 3: 1, [FOODS.masterBase + 2]: 5 }), level);
    expect(p).toEqual({
      kind: 'wildcard',
      level: 2,
      consume: [
        { foodsId: 1, num: 1 },
        { foodsId: 3, num: 1 },
        { foodsId: 2, num: 1 },
        { foodsId: fid('二级万能食材'), num: 1 },
      ],
    });
  });
  it('万能食材不够、缺两种、缺的是神秘食材时不能学', () => {
    expect(planLearn(need, stock({ 1: 1, 2: 0, 3: 1, [FOODS.masterBase + 2]: 1 }), level).kind).toBe('none');
    expect(
      planLearn(need, stock({ 1: 1, [FOODS.masterBase + 2]: 9, [FOODS.masterBase + 3]: 9 }), level).kind,
    ).toBe('none');
    expect(planLearn([{ foodsId: 7, num: 1 }], stock({}), level).kind).toBe('none');
  });
  it('重复的食材合并计算', () => {
    const dup = [
      { foodsId: 1, num: 1 },
      { foodsId: 1, num: 1 },
    ];
    // 合并后需要 2 个，只有 1 个：缺的 1 个用一级万能食材补
    expect(planLearn(dup, stock({ 1: 1 }), level).kind).toBe('none');
    expect(planLearn(dup, stock({ 1: 1, [FOODS.masterBase + 1]: 1 }), level).kind).toBe('wildcard');
  });
});

describe('派生计数', () => {
  it('新学：已学数和街道数 +1；升级：品级计数挪一格', () => {
    const c0 = { learned: 0, grade: Array(11).fill(0) as number[], street: {} };
    const c1 = applyLearn(c0, 6, 0, 1);
    expect(c1).toEqual({ learned: 1, grade: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], street: { '6': 1 } });
    const c2 = applyLearn(c1, 6, 1, 2);
    expect(c2.grade.slice(0, 3)).toEqual([0, 0, 1]);
    expect(c2.learned).toBe(1);
    expect(c0.learned).toBe(0);
  });
});

describe('食材需求（规格书 03 §3.8）', () => {
  it('本街目标品级从 5 起算，全部达到就 +1', () => {
    const levels = new Uint8Array([0, 5, 5, 4]);
    const same = Int32Array.from([0, 1, 2, 3]);
    expect(streetTargetGrade(levels, same, [1, 2], 7)).toBe(6);
    expect(streetTargetGrade(levels, same, [1, 2, 3], 7)).toBe(5);
    expect(streetTargetGrade(new Uint8Array([0, 7]), same, [1], 7)).toBe(7);
  });
  it('把食谱升到目标品级还要多少食材', () => {
    const levels = new Uint8Array([0, 1, 0]);
    const needOf = (_id: number, g: number) => [{ foodsId: 100 + g, num: g }];
    const m = foodsNeedFor([1, 2], levels, Int32Array.from([0, 1, 2]), 2, needOf);
    expect([...m]).toEqual([
      [102, 4],
      [101, 1],
    ]);
  });
});

describe('applyForget（设计文档 裁定 9）', () => {
  it('学会数 -1、原品级计数 -1、街道计数 -1', () => {
    const c = applyForget({ learned: 3, grade: [0, 1, 2, 0], street: { '5': 2, '6': 1 } }, 5, 2);
    expect(c).toEqual({ learned: 2, grade: [0, 1, 1, 0], street: { '5': 1, '6': 1 } });
  });
});

describe('padLevels（问题记录 284）', () => {
  it('比存储位总数短时补 0，原内容不变；够长时原样返回', () => {
    const r = padLevels(new Uint8Array([0, 3, 0]), 6);
    expect([...r]).toEqual([0, 3, 0, 0, 0, 0]);
    const long = new Uint8Array(6);
    expect(padLevels(long, 6)).toBe(long);
  });
});

describe('按存储位读写学会记录（重新编号 PR 3）', () => {
  // 食谱 10 → 存储位 2，食谱 11 → 存储位 0；其余没有
  const slotOf = new Int32Array(12).fill(-1);
  slotOf[10] = 2;
  slotOf[11] = 0;
  it('按存储位取品级；没有这道菜、字节串不够长都算 0', () => {
    const levels = new Uint8Array([4, 0, 7]);
    expect(gradeOf(levels, slotOf, 10)).toBe(7);
    expect(gradeOf(levels, slotOf, 11)).toBe(4);
    expect(gradeOf(levels, slotOf, 5)).toBe(0);
    expect(gradeOf(new Uint8Array(1), slotOf, 10)).toBe(0);
  });
  it('按存储位写；没有这道菜时抛错', () => {
    const levels = new Uint8Array(3);
    setGrade(levels, slotOf, 10, 3);
    expect([...levels]).toEqual([0, 0, 3]);
    expect(() => setGrade(levels, slotOf, 5, 1)).toThrow('unknown cookbook 5');
  });
});
