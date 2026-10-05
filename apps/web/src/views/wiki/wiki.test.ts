import { describe, expect, it } from 'vitest';
import { listBack } from './wiki';

describe('详情页的“返回”（问题记录 372）', () => {
  it('从这个列表点进来的：回到原来的列表地址，带着搜索和筛选', () => {
    expect(listBack('/wiki/cookbooks', '/wiki/cookbooks?street=3&n=100')).toBe(
      '/wiki/cookbooks?street=3&n=100',
    );
    expect(listBack('/wiki/cookbooks', '/wiki/cookbooks')).toBe('/wiki/cookbooks');
  });

  it('从别处来的（别的详情、别的列表、直接打开）：回到这个列表的首页', () => {
    expect(listBack('/wiki/cookbooks', '/wiki/foods/1001')).toBe('/wiki/cookbooks');
    expect(listBack('/wiki/goods', '/wiki/goods-x?q=1')).toBe('/wiki/goods');
    expect(listBack('/wiki/goods', '/wiki/equips?f=1')).toBe('/wiki/goods');
    expect(listBack('/wiki/goods', null)).toBe('/wiki/goods');
    expect(listBack('/wiki/goods', undefined)).toBe('/wiki/goods');
  });
});
