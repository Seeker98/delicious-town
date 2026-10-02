import { describe, expect, it } from 'vitest';
import {
  EXCHANGE_FLAGS,
  exchangeConfiscateBody,
  exchangeFreezeBody,
  exchangeOrderBody,
  exchangeSuspiciousQuery,
} from './exchange';

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

describe('交易所后台请求（156-2 设计 §6、§7）', () => {
  it('冻结要原因；没收按成交或按店二选一；列表可按标记筛选', () => {
    expect(exchangeFreezeBody.parse({ restId: 3, reason: '对倒' })).toEqual({ restId: 3, reason: '对倒' });
    expect(exchangeFreezeBody.safeParse({ restId: 3, reason: '' }).success).toBe(false);
    expect(exchangeConfiscateBody.parse({ tradeId: 5 })).toEqual({ tradeId: 5 });
    expect(exchangeConfiscateBody.parse({ restId: 7 })).toEqual({ restId: 7 });
    expect(exchangeConfiscateBody.safeParse({}).success).toBe(false);
    expect(exchangeSuspiciousQuery.parse({ shardId: '2', flag: 'large' })).toEqual({
      shardId: 2,
      flag: 'large',
    });
    expect(exchangeSuspiciousQuery.safeParse({ shardId: '2', flag: 'nope' }).success).toBe(false);
    expect(EXCHANGE_FLAGS.same_ip).toBe('同 IP');
  });
});
