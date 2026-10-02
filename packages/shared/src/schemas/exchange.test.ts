import { describe, expect, it } from 'vitest';
import { exchangeOrderBody } from './exchange';

describe('交易所下单请求（156-1 设计 §6.1）', () => {
  it('合法的能过；方向、单价、数量都要合法', () => {
    expect(exchangeOrderBody.parse({ foodsId: 3, side: 'buy', price: 100, qty: 2 })).toEqual({
      foodsId: 3,
      side: 'buy',
      price: 100,
      qty: 2,
    });
    expect(exchangeOrderBody.safeParse({ foodsId: 3, side: 'hold', price: 100, qty: 2 }).success).toBe(false);
    expect(exchangeOrderBody.safeParse({ foodsId: 3, side: 'buy', price: 0, qty: 2 }).success).toBe(false);
    expect(exchangeOrderBody.safeParse({ foodsId: 3, side: 'buy', price: 1.5, qty: 2 }).success).toBe(false);
    expect(exchangeOrderBody.safeParse({ foodsId: 3, side: 'sell', price: 10, qty: 1000 }).success).toBe(
      false,
    );
  });
});
