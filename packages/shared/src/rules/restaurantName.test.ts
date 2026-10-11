import { describe, expect, it } from 'vitest';
import { checkRestaurantName, restaurantNameWeight } from './restaurantName';

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

describe('restaurantNameWeight（界面改版 P11 开店页数字数）', () => {
  it('汉字 8 分、字母数字 5 分，空串 0 分', () => {
    expect(restaurantNameWeight('')).toBe(0);
    expect(restaurantNameWeight('美味小馆')).toBe(32);
    expect(restaurantNameWeight('abc123')).toBe(30);
    expect(restaurantNameWeight('小馆A1')).toBe(26);
  });
  it('下划线、减号等别的字也按 8 分；不去首尾空格（调用方自己 trim）', () => {
    expect(restaurantNameWeight('_-')).toBe(16);
    expect(restaurantNameWeight(' a ')).toBe(21);
  });
  it('按字符算：emoji 这类占两个码元的字只算一个', () => {
    expect(restaurantNameWeight('😋')).toBe(8);
  });
  it('和长度规则一致：64 分以内合规，超过就是 too_long', () => {
    expect(restaurantNameWeight('一二三四五六七八')).toBe(64);
    expect(restaurantNameWeight('abcdefghijklm')).toBe(65);
  });
});
