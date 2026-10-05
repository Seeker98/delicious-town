import { describe, expect, it } from 'vitest';
import { addMedalRows, assignSlots, importConflicts, pruneNames } from './streetImport';
import { gid } from './testItems';

describe('新街道导入的辅助（backlog 284）', () => {
  it('重跑导入时删掉已经不存在的新菜谱译名；老菜谱和这次导入的照留', () => {
    const names = { '1': { name: 'old' }, '18747': { name: 'kept' }, '18748': { name: 'gone' } };
    expect(pruneNames(names, new Set([1]), new Set([18747]))).toEqual({
      names: { '1': { name: 'old' }, '18747': { name: 'kept' } },
      removed: [18748],
    });
  });

  it('新街道在勋章对照表里没有行时补上（勋章 id = 60000 + 街道 id），已有的不动', () => {
    const map = [
      { streetId: 0, goodsId: gid('新手街') },
      { streetId: 14, goodsId: gid('日本街') },
    ];
    expect(addMedalRows(map, [14, 15], (s) => 60000 + s)).toEqual({
      rows: [
        { streetId: 0, goodsId: gid('新手街') },
        { streetId: 14, goodsId: gid('日本街') },
        { streetId: 15, goodsId: gid('意大利街') },
      ],
      added: [15],
    });
  });
});

describe('导入前检查已上线的新菜谱 id（backlog 284 终审）', () => {
  it('上次导入过的 id 这次没了、或者换了街道，列出来（导入脚本据此中止）', () => {
    const prev = [
      { id: 18747, streetId: 14 },
      { id: 18748, streetId: 14 },
      { id: 18749, streetId: 15 },
    ];
    const next = [
      { id: 18747, streetId: 14 },
      { id: 18749, streetId: 16 },
      { id: 18750, streetId: 16 },
    ];
    expect(importConflicts(prev, next)).toEqual({ removed: [18748], restreeted: [18749] });
    expect(importConflicts(prev, prev)).toEqual({ removed: [], restreeted: [] });
  });
});

describe('新菜谱分配存储位（重新编号 PR 3）', () => {
  it('已有的保留，新的从 next 往后，删掉的不回收', () => {
    const r = assignSlots(
      [
        { id: 10, slot: 5 },
        { id: 11, slot: 6 },
      ],
      [11, 12, 13],
      7,
    );
    expect([...r.slots]).toEqual([
      [11, 6],
      [12, 7],
      [13, 8],
    ]);
    expect(r.next).toBe(9);
  });
  it('没有新菜时 next 不变', () => {
    expect(assignSlots([{ id: 10, slot: 5 }], [10], 7)).toEqual({ slots: new Map([[10, 5]]), next: 7 });
  });
});
