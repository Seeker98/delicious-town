import { describe, expect, it } from 'vitest';
import { buildPool, pickWeighted } from './weighted';
import { seededRng, sequenceRng } from './rng';

const items = [
  { id: 'a', w: 1 },
  { id: 'b', w: 2 },
  { id: 'c', w: 3 },
];

describe('weighted pool', () => {
  it('排除权重 <= 0 的项并计算前缀和', () => {
    const pool = buildPool([...items, { id: 'z', w: 0 }], (x) => x.w);
    expect(pool.items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(pool.prefix).toEqual([1, 3, 6]);
    expect(pool.total).toBe(6);
  });

  it('区间判定与旧版一致：rateMax - odds <= r < rateMax', () => {
    const pool = buildPool(items, (x) => x.w);
    expect(pickWeighted(pool, sequenceRng([0])).id).toBe('a');
    expect(pickWeighted(pool, sequenceRng([0.99 / 6])).id).toBe('a');
    expect(pickWeighted(pool, sequenceRng([1 / 6])).id).toBe('b');
    expect(pickWeighted(pool, sequenceRng([3 / 6])).id).toBe('c');
    expect(pickWeighted(pool, sequenceRng([0.9999])).id).toBe('c');
  });

  it('大量抽取时频率接近权重', () => {
    const pool = buildPool(items, (x) => x.w);
    const rng = seededRng(2026);
    const count: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 60000; i++) count[pickWeighted(pool, rng).id]! += 1;
    expect(count.a! / 60000).toBeCloseTo(1 / 6, 1);
    expect(count.c! / 60000).toBeCloseTo(3 / 6, 1);
  });

  it('空池抛错', () => {
    expect(() =>
      pickWeighted(
        buildPool([], () => 1),
        seededRng(1),
      ),
    ).toThrow('empty pool');
  });
});
