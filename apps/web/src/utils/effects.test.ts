import { describe, expect, it } from 'vitest';
import { effectChips } from './effects';

describe('effectChips（问题记录：生效的加成展示凌乱）', () => {
  it('每项一个标签；挑剔率、耗油是越低越好', () => {
    expect(effectChips({ atRate: 0.35, spRate: 0.1, oilRate: -0.1, luckValue: 36 })).toEqual([
      { text: '上座率+35%', good: true },
      { text: '挑剔率+10%', good: false },
      { text: '耗油-10%', good: true },
      { text: '幸运+36', good: true },
    ]);
  });
});
