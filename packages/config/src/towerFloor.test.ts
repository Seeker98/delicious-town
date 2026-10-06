import { describe, expect, it } from 'vitest';
import type { EquipAttrs, Goods, SuitDef } from './types';
import { elderAttrs, elderErrors, elderLevelErrors, type ElderInput } from './towerFloor';

const zero: EquipAttrs = { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
const attrs = (p: Partial<EquipAttrs>): EquipAttrs => ({ ...zero, ...p });
const equip = (
  id: number,
  part: number,
  suitId: number,
  ranges: Partial<EquipAttrs> | null,
  total: number | null,
) =>
  ({
    id,
    name: `件${id}`,
    equip: {
      part,
      essence: 1,
      hole: 0,
      maxHole: 0,
      minLevel: 0,
      suitId,
      total,
      ranges:
        ranges === null
          ? { cook: [0, 6], cutting: [0, 6], fire: [0, 6], season: [0, 6], creatives: [0, 6], luck: [0, 6] }
          : attrs(ranges),
      stressTable: [10, 12, 15, 19],
    },
  }) as unknown as Goods;
const goods = new Map<number, Goods>([
  [1, equip(1, 1, 7, { cook: 10 }, null)],
  [2, equip(2, 2, 7, { cutting: 10 }, null)],
  [3, equip(3, 3, 0, null, 6)],
  [4, equip(4, 4, 8, { cook: 10 }, null)],
  [9, { id: 9, name: '不是厨具' } as unknown as Goods],
]);
const suits = new Map<number, SuitDef>([
  [
    7,
    {
      id: 7,
      name: '套',
      maxNum: 2,
      tiers: [{ need: 2, desc: '', effects: { cookPct: 0.1, defendCutting: 0.2, luckValue: 5 } }],
    },
  ],
]);
// 3 级：加点 6；强化 +2：每件多 15 − 10 = 5
const elder: ElderInput = {
  floor: 1,
  level: 3,
  stress: 2,
  points: { cook: 2, cutting: 0, fire: 4 },
  pieces: [
    { id: 1, base: attrs({ cook: 10 }), gain: attrs({ season: 5 }) },
    { id: 2, base: attrs({ cutting: 10 }), gain: attrs({ cutting: 3, luck: 2 }) },
    { id: 3, base: attrs({ fire: 3, season: 3 }), gain: attrs({ creatives: 5 }) },
  ],
  drops: [1, 2],
};
const ctx = { goods, suits, attrPerLevel: 3, luckPerLevel: 1 };

describe('赛厨长老（问题记录 408）', () => {
  it('属性 = 加点 + 厨具基础 + 强化增量；套装百分比；被挑战的防守加成；幸运 = 等级 − 1 + 厨具 + 套装幸运值', () => {
    // 厨艺 (2+10)×1.1 = 13.2 → 13；刀工 13 × 1.2 = 15.6 → 16；火候 4+3 = 7；调味 5+3 = 8；创意 5；幸运 2 + 2 + 5 = 9
    expect(elderAttrs(elder, ctx)).toEqual({
      attrs: { cook: 13, cutting: 16, fire: 7, season: 8, creatives: 5, luck: 9 },
      power: 13 + 16 + 7 + 8 + 5 + 4,
    });
  });

  it('数据正确时没有错误', () => {
    expect(elderErrors(elder, ctx)).toEqual([]);
  });

  it('加点总数要等于每级点数 × (等级 − 1)，而且只能加厨艺、刀工、火候', () => {
    expect(elderErrors({ ...elder, points: { cook: 1, cutting: 0, fire: 4 } }, ctx)).toEqual([
      'tower_elders floor 1: points sum 5, expected 6',
    ]);
  });

  it('固定属性的厨具基础必须和配置一样；随机属性的厨具基础总和等于 total、每项在范围内', () => {
    const bad = (i: number, base: Partial<EquipAttrs>) => ({
      ...elder,
      pieces: elder.pieces.map((p, j) => (j === i ? { ...p, base: attrs(base) } : p)),
    });
    expect(elderErrors(bad(0, { cook: 9, cutting: 1 }), ctx)).toEqual([
      'tower_elders floor 1: piece 1 base must equal its fixed attrs',
    ]);
    expect(elderErrors(bad(2, { fire: 3, season: 2 }), ctx)).toEqual([
      'tower_elders floor 1: piece 3 base sums to 5, expected 6',
    ]);
    expect(elderErrors(bad(2, { fire: 7, season: -1 }), ctx)).toEqual([
      'tower_elders floor 1: piece 3 base fire 7 out of range [0, 6]',
      'tower_elders floor 1: piece 3 base season -1 out of range [0, 6]',
    ]);
  });

  it('强化增量总和等于强化表的差、不能为负；强化等级不超过表；部位不重复；掉落和厨具都要是厨具', () => {
    const gain = { ...elder, pieces: [{ ...elder.pieces[0]!, gain: attrs({ season: 4 }) }] };
    expect(elderErrors(gain, ctx)).toEqual(['tower_elders floor 1: piece 1 gain sums to 4, expected 5']);
    expect(elderErrors({ ...elder, stress: 4 }, ctx)).toEqual([
      'tower_elders floor 1: stress 4 beyond piece 1 table',
    ]);
    expect(elderErrors({ ...elder, pieces: [elder.pieces[0]!, elder.pieces[0]!] }, ctx)).toEqual([
      'tower_elders floor 1: part 1 used twice',
    ]);
    expect(
      elderErrors(
        { ...elder, pieces: [...elder.pieces, { id: 9, base: zero, gain: zero }], drops: [1, 9] },
        ctx,
      ),
    ).toEqual(['tower_elders floor 1: 9 is not equipment', 'tower_elders floor 1: drop 9 is not equipment']);
  });

  it('强化增量要能由每一级的增量整份分到某一项得到（游戏里每次强化成功整份加到一项）', () => {
    // 强化表 10、12、15：两级增量 2、3
    const piece = (gain: Partial<EquipAttrs>) => ({
      ...elder,
      pieces: [{ ...elder.pieces[0]!, gain: attrs(gain) }],
    });
    expect(elderErrors(piece({ cutting: 2, fire: 3 }), ctx)).toEqual([]);
    expect(elderErrors(piece({ cook: 1, cutting: 4 }), ctx)).toEqual([
      'tower_elders floor 1: piece 1 gain cannot be made from enhancement steps 2, 3',
    ]);
  });

  it('掉落列表不能重复', () => {
    expect(elderErrors({ ...elder, drops: [1, 1] }, ctx)).toEqual([
      'tower_elders floor 1: drop 1 listed twice',
    ]);
  });

  it('掉落要是长老身上某件厨具的同套装（backlog 408）', () => {
    expect(elderErrors({ ...elder, drops: [1, 3] }, ctx)).toEqual([]);
    expect(elderErrors({ ...elder, drops: [1, 4] }, ctx)).toEqual([
      'tower_elders floor 1: drop 4 is suit 8, not worn by the elder',
    ]);
  });

  it('长老等级不低于这层的解锁等级，且一层比一层高（backlog 408）', () => {
    expect(
      elderLevelErrors([
        { floor: 1, minLevel: 1, level: 8 },
        { floor: 2, minLevel: 11, level: 27 },
      ]),
    ).toEqual([]);
    expect(elderLevelErrors([{ floor: 1, minLevel: 10, level: 8 }])).toEqual([
      'tower_elders floor 1: level 8 is below the floor unlock level 10',
    ]);
    expect(
      elderLevelErrors([
        { floor: 2, minLevel: 11, level: 27 },
        { floor: 1, minLevel: 1, level: 27 },
      ]),
    ).toEqual(['tower_elders floor 2: level 27 is not above floor 1 (27)']);
  });
});
