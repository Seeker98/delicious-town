import { z } from 'zod';

export type ExchangeSide = 'buy' | 'sell';

/** 下单请求（156-1 设计 §6.1）；价格范围、数量上限在服务端按区服数值再查 */
export const exchangeOrderBody = z.object({
  foodsId: z.number().int().positive(),
  side: z.enum(['buy', 'sell']),
  price: z.number().int().min(1).max(100_000_000),
  qty: z.number().int().min(1).max(999),
});

export interface ExchangeOrderDto {
  id: number;
  side: ExchangeSide;
  foodsId: number;
  price: number;
  qty: number;
  filled: number;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface ExchangeFoodDto {
  foodsId: number;
  ref: number;
  last: number | null;
  /** 最新成交价相对参考价的涨跌（小数，0.1 = 涨 10%）；没有成交为 null */
  changePct: number | null;
}

export interface ExchangeLevelDto {
  price: number;
  qty: number;
}

export interface ExchangeBookDto {
  foodsId: number;
  ref: number;
  min: number;
  max: number;
  last: number | null;
  volume: number;
  bids: ExchangeLevelDto[];
  asks: ExchangeLevelDto[];
}

export interface ExchangeTradeDto {
  side: ExchangeSide;
  foodsId: number;
  price: number;
  qty: number;
  fee: number;
  createdAt: string;
}

export interface ExchangeMeDto {
  eligible: boolean;
  /** 不满足的那一项：exchange_level / exchange_age / exchange_email；满足为 null */
  reason: string | null;
  need: { level: number; days: number };
  orders: ExchangeOrderDto[];
  wallet: { coin: number; foods: Array<{ foodsId: number; num: number }> };
  trades: ExchangeTradeDto[];
  feeRate: number;
}

export interface ExchangePlaceDto {
  order: ExchangeOrderDto;
  fills: Array<{ price: number; qty: number }>;
}

export interface ExchangeWithdrawDto {
  coin: number;
  foods: Array<{ foodsId: number; num: number }>;
  left: Array<{ foodsId: number; num: number }>;
}
