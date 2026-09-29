import { describe, expect, it } from 'vitest';
import { checkRestaurantName } from './restaurantName';

describe('checkRestaurantName（规格书 02 §2.1）', () => {
  it('合法名称', () => {
    expect(checkRestaurantName('美味小馆')).toBe('ok');
    expect(checkRestaurantName('  Tasty_House  ')).toBe('ok');
  });
  it('空名称', () => {
    expect(checkRestaurantName('   ')).toBe('empty');
  });
  it('非法字符：emoji、全角标点、空格', () => {
    expect(checkRestaurantName('好吃😋')).toBe('bad_chars');
    expect(checkRestaurantName('好吃！')).toBe('bad_chars');
    expect(checkRestaurantName('好 吃')).toBe('bad_chars');
  });
  it('长度：汉字按 8、字母数字按 5 累计，上限 64', () => {
    expect(checkRestaurantName('一二三四五六七八')).toBe('ok');
    expect(checkRestaurantName('一二三四五六七八九')).toBe('too_long');
    expect(checkRestaurantName('abcdefghijkl')).toBe('ok');
    expect(checkRestaurantName('abcdefghijklm')).toBe('too_long');
  });
  it('保留字', () => {
    expect(checkRestaurantName('镇长的店')).toBe('reserved');
    expect(checkRestaurantName('小蟹老板')).toBe('reserved');
  });
});
