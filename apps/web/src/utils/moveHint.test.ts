import { describe, expect, it } from 'vitest';
import { moveHint } from './moveHint';

describe('搬街提示（问题记录 378 后续）：本街剩下的菜全学会也凑不够下一星', () => {
  it('新手街 69 道、学了 30 道、2 星要 100 道：还差 31 道', () => {
    expect(moveHint({ need: 100, learned: 30, streetTotal: 69, streetLearned: 30 })).toBe(31);
  });
  it('别的街学过的也算：已经学了 50 道（本街 30）时，本街全学完是 89 道，还差 11', () => {
    expect(moveHint({ need: 100, learned: 50, streetTotal: 69, streetLearned: 30 })).toBe(11);
  });
  it('本街够用、刚好够、或者没有下一星的菜数要求时不提示', () => {
    expect(moveHint({ need: 300, learned: 120, streetTotal: 333, streetLearned: 100 })).toBeNull();
    expect(moveHint({ need: 100, learned: 31, streetTotal: 69, streetLearned: 0 })).toBeNull();
    expect(moveHint({ need: null, learned: 30, streetTotal: 69, streetLearned: 30 })).toBeNull();
  });
});
