import { describe, expect, it } from 'vitest';
import { SHOP_CATS, shopCat } from './shopCats';

describe('商店大类', () => {
  it('艺术品（名曲、名画，2026-10-17）单独一类，排在海报奖杯后面', () => {
    expect(shopCat(30601)).toBe('art');
    expect(shopCat(30609)).toBe('art');
    expect(shopCat(30709)).toBe('art');
    expect(shopCat(30001)).toBe('promo');
    expect(SHOP_CATS.indexOf('art')).toBe(SHOP_CATS.indexOf('promo') + 1);
  });
});
