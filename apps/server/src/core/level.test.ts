import { describe, expect, it } from 'vitest';
import { applyExp } from './level';

describe('applyExp（规格书 02 §2.2）', () => {
  it('不够升级时只累加经验', () => {
    expect(applyExp(1, 0, 499)).toEqual({ level: 1, exp: 499, gained: 0 });
  });
  it('刚好升一级，经验清零', () => {
    expect(applyExp(1, 0, 500)).toEqual({ level: 2, exp: 0, gained: 1 });
  });
  it('可以连升多级：1→2 要 500，2→3 要 2000', () => {
    expect(applyExp(1, 0, 2600)).toEqual({ level: 3, exp: 100, gained: 2 });
  });
  it('已有经验一起算', () => {
    expect(applyExp(2, 1900, 150)).toEqual({ level: 3, exp: 50, gained: 1 });
  });
});
