import { describe, expect, it } from 'vitest';
import { addMedalRows, pruneNames } from './streetImport';

describe('新街道导入的辅助（backlog 284）', () => {
  it('重跑导入时删掉已经不存在的新菜谱译名；老菜谱和这次导入的照留', () => {
    const names = { '1': { name: 'old' }, '18747': { name: 'kept' }, '18748': { name: 'gone' } };
    expect(pruneNames(names, new Set([1]), new Set([18747]))).toEqual({
      names: { '1': { name: 'old' }, '18747': { name: 'kept' } },
      removed: [18748],
    });
  });

  it('新街道在勋章对照表里没有行时补上（勋章 id = 92000 + 街道 id），已有的不动', () => {
    const map = [
      { streetId: 0, goodsId: 140 },
      { streetId: 14, goodsId: 92014 },
    ];
    expect(addMedalRows(map, [14, 15], (s) => 92000 + s)).toEqual({
      rows: [
        { streetId: 0, goodsId: 140 },
        { streetId: 14, goodsId: 92014 },
        { streetId: 15, goodsId: 92015 },
      ],
      added: [15],
    });
  });
});
