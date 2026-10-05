import { describe, expect, it } from 'vitest';
import { splitLearned } from './tables';

describe('splitLearned：按存储位找出学会的菜（重新编号 PR 3）', () => {
  // 存储位 0 → 菜 5（1 号街），1 是空位（删掉的菜），2 → 菜 7（2 号街）；菜 6 已删（街道 -1）
  const idx = {
    idAt: Int32Array.from([5, -1, 7]),
    street: Int16Array.from([-1, -1, -1, -1, -1, 1, -1, 2]),
  };

  it('空位上的字节、超出存储位总数的字节都不算（换号后老店的字节串可能更长）', () => {
    const levels = Uint8Array.from([3, 2, 1, 4, 5]);
    expect(splitLearned(levels, idx, 1)).toEqual({ all: [5, 7], local: [5], other: [7] });
  });

  it('字节串比存储位短时只看有的部分', () => {
    expect(splitLearned(Uint8Array.from([1]), idx, 2)).toEqual({ all: [5], local: [], other: [5] });
  });
});
