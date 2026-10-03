import { describe, expect, it } from 'vitest';
import { seededRng, sequenceRng } from '@dt/shared';
import { collectTransitions, extendGrades, type GradeTable } from './gradeGen';

const g = (...ids: number[]) => ids.map((foodsId) => ({ foodsId, num: 1 }));
/** 1~7 品级：普通食材 1→6 品级 ×10、7 品级 ×25；900 是神秘食材（×3、×8） */
function base(ids: number[]): GradeTable {
  const t: GradeTable = {};
  for (let i = 1; i <= 5; i++) t[String(i)] = g(...ids);
  t['6'] = ids.map((foodsId) => ({ foodsId, num: foodsId === 900 ? 3 : 10 }));
  t['7'] = ids.map((foodsId) => ({ foodsId, num: foodsId === 900 ? 8 : 25 }));
  return t;
}
const isMystery = (id: number) => id === 900;

/** 老数据：食材 1 在 8→9 品级 3 次换成 50×100、1 次不换；9→10 时 50 换成 60×25 */
const old: Array<{ needFoodsByLevel: GradeTable }> = [
  ...Array.from({ length: 3 }, () => ({
    needFoodsByLevel: {
      '8': [{ foodsId: 1, num: 100 }],
      '9': [{ foodsId: 50, num: 100 }],
      '10': [{ foodsId: 60, num: 25 }],
    },
  })),
  {
    needFoodsByLevel: {
      '8': [{ foodsId: 1, num: 100 }],
      '9': [{ foodsId: 1, num: 100 }],
      '10': [{ foodsId: 1, num: 100 }],
    },
  },
];

describe('8~10 品级生成（问题记录 284）', () => {
  it('统计老数据的换料频率（按格子位置对应）', () => {
    const t = collectTransitions(old, 8, 9);
    expect([...t.get(1)!.values()]).toEqual([
      { foodsId: 50, num: 100, count: 3 },
      { foodsId: 1, num: 100, count: 1 },
    ]);
  });

  it('8 品级沿用 7 品级食材：普通 ×100、神秘 ×20；没有换料记录的食材 9、10 品级不换（普通 100、神秘 25/32）', () => {
    const r = extendGrades(base([7, 8, 900]), new Map(), new Map(), isMystery, seededRng(1));
    expect(r['8']).toEqual([
      { foodsId: 7, num: 100 },
      { foodsId: 8, num: 100 },
      { foodsId: 900, num: 20 },
    ]);
    expect(r['9']).toEqual([
      { foodsId: 7, num: 100 },
      { foodsId: 8, num: 100 },
      { foodsId: 900, num: 25 },
    ]);
    expect(r['10']).toEqual([
      { foodsId: 7, num: 100 },
      { foodsId: 8, num: 100 },
      { foodsId: 900, num: 32 },
    ]);
    expect(r['7']).toEqual(base([7, 8, 900])['7']);
  });

  it('按次数加权抽取：随机数落在前 3/4 换成 50，落在后 1/4 不换；10 品级接着按 9→10 抽', () => {
    const t89 = collectTransitions(old, 8, 9);
    const t910 = collectTransitions(old, 9, 10);
    const a = extendGrades(base([1, 2, 3]), t89, t910, isMystery, sequenceRng([0.5]));
    expect(a['9']![0]).toEqual({ foodsId: 50, num: 100 });
    expect(a['10']![0]).toEqual({ foodsId: 60, num: 25 });
    const b = extendGrades(base([1, 2, 3]), t89, t910, isMystery, sequenceRng([0.9]));
    expect(b['9']![0]).toEqual({ foodsId: 1, num: 100 });
  });

  it('同一品级不出现重复食材：要换成的食材已在别的格子里就不选它', () => {
    const t89 = collectTransitions(old, 8, 9);
    const r = extendGrades(base([1, 50, 3]), t89, new Map(), isMystery, sequenceRng([0.1]));
    expect(r['9']!.map((f) => f.foodsId)).toEqual([1, 50, 3]);
  });

  it('同样的种子结果相同', () => {
    const t89 = collectTransitions(old, 8, 9);
    const t910 = collectTransitions(old, 9, 10);
    const run = () => extendGrades(base([1, 2, 3]), t89, t910, isMystery, seededRng(2026));
    expect(run()).toEqual(run());
  });
});
