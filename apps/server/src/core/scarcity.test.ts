import { describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { needChance, needMapOf, pickWithNeed } from './scarcity';
import { fid } from '../../test/items';

const t = { needBase: 0.05, needLuckFactor: 0.6, needMax: 0.3 };

describe('缺料清单（问题记录 50）', () => {
  it('本街每道菜下一品级的需要合计，减去已有；满级不算', () => {
    const levels = new Uint8Array([0, 0, 2, 10]);
    const needOf = (id: number, g: number) =>
      id === 1
        ? [{ foodsId: fid('大米'), num: 2 }]
        : id === 2 && g === 3
          ? [
              { foodsId: fid('大米'), num: 1 },
              { foodsId: fid('青椒'), num: 3 },
            ]
          : [{ foodsId: fid('苦瓜'), num: 9 }];
    const have = (f: number) => (f === 101 ? 1 : f === 102 ? 5 : 0);
    expect(
      Object.fromEntries(needMapOf([1, 2, 3], levels, Int32Array.from([0, 1, 2, 3]), 10, needOf, have)),
    ).toEqual({ 101: 2 });
  });
});

describe('缺料概率', () => {
  it('基础 + 幸运率 × 系数，封顶；幸运为负按 0', () => {
    expect(needChance(t, 0)).toBeCloseTo(0.05);
    expect(needChance(t, 0.17)).toBeCloseTo(0.152);
    expect(needChance(t, 2)).toBe(0.3);
    expect(needChance(t, -0.5)).toBeCloseTo(0.05);
  });
});

describe('抽取', () => {
  const need = new Map([
    [101, 3],
    [102, 1],
    [201, 5],
  ]);
  const lv1 = (id: number) => id < 200;
  it('命中时在范围内按缺口加权抽', () => {
    // 第一个随机数判定命中（< p），第二个在 [101×3, 102×1] 里抽：0.8 × 4 = 3.2 → 102
    expect(pickWithNeed(need, lv1, 0.5, sequenceRng([0.1, 0.8]), () => 999)).toBe(102);
    expect(pickWithNeed(need, lv1, 0.5, sequenceRng([0.1, 0.5]), () => 999)).toBe(101);
  });
  it('没命中、p 为 0、范围里没有缺料时走原来的抽法', () => {
    expect(pickWithNeed(need, lv1, 0.5, sequenceRng([0.9]), () => 999)).toBe(999);
    expect(pickWithNeed(need, lv1, 0, sequenceRng([0]), () => 999)).toBe(999);
    expect(
      pickWithNeed(
        need,
        (id) => id > 300,
        1,
        sequenceRng([0]),
        () => 999,
      ),
    ).toBe(999);
    expect(pickWithNeed(new Map(), lv1, 1, sequenceRng([0]), () => 999)).toBe(999);
  });
});
