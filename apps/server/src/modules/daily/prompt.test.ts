import { describe, expect, it } from 'vitest';
import { TRANSLATE_SYSTEM } from './prompt';

describe('小镇日报翻译提示', () => {
  it('写明英文里不能留中文，题目也要翻（检查会拒收带中文的英文稿，终审：不写的话预测题目常被原样保留、整天重试）', () => {
    expect(TRANSLATE_SYSTEM).toMatch(/no Chinese characters/i);
    expect(TRANSLATE_SYSTEM).toMatch(/quoted titles/i);
  });
});
