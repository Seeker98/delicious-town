import { describe, expect, it } from 'vitest';
import { hashSeed, seededRng, sequenceRng } from './rng';

describe('seededRng', () => {
  it('同一种子产生相同序列，不同种子不同', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const sa = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(sa);
    expect([c.next(), c.next(), c.next()]).not.toEqual(sa);
  });

  it('next 落在 [0,1)，int/intMin1 落在各自区间', () => {
    const r = seededRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
      const m = r.intMin1(5);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(5);
    }
  });

  it('边界：int(0)=0，intMin1(0)=1（与旧版 getRandowWithMin1 一致）', () => {
    const r = seededRng(1);
    expect(r.int(0)).toBe(0);
    expect(r.intMin1(0)).toBe(1);
  });
});

describe('sequenceRng', () => {
  it('按给定序列循环返回', () => {
    const r = sequenceRng([0.1, 0.9]);
    expect([r.next(), r.next(), r.next()]).toEqual([0.1, 0.9, 0.1]);
    expect(sequenceRng([0.5]).chance(0.6)).toBe(true);
    expect(sequenceRng([0.5]).chance(0.5)).toBe(false);
  });
});

describe('hashSeed', () => {
  it('确定且区分输入', () => {
    expect(hashSeed(1, 100, 912)).toBe(hashSeed(1, 100, 912));
    expect(hashSeed(1, 100, 912)).not.toBe(hashSeed(1, 101, 912));
  });
});
