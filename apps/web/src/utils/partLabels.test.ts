import { describe, expect, it } from 'vitest';
import { PART_LABELS } from './labels';

describe('收益页加成分项的名字', () => {
  it('低等级经验加成有名字，不显示键名 newbie（问题记录 378 审查）', () => {
    expect(PART_LABELS.newbie).toBe('新手经验');
  });
});
