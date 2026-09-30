import { z } from 'zod';

export const marketBuyBody = z.object({
  itemId: z.number().int().positive(),
  num: z.number().int().min(1).max(1000),
});
export const guessBody = z.object({ foodsIds: z.array(z.number().int().positive()).min(1).max(20) });

export interface MarketItemDto {
  id: number;
  shelf: 0 | 1 | 2;
  foodsId: number;
  price: number;
  stock: number;
  left: number;
  hot: boolean;
  /** 本轮每人限购 */
  limit: number;
  /** 本轮我已经买了多少 */
  bought: number;
  openedAt: string;
}

export interface MarketDto {
  daily: MarketItemDto[];
  special: MarketItemDto[];
  premium: MarketItemDto[];
  nextDaily: string;
  nextSpecial: string;
  nextPremium: string;
  /** 这个网络的特价冷却结束时间；null = 现在能买 */
  specialCooldownUntil: string | null;
  /** 特价同一网络的购买间隔（分钟） */
  specialCooldownMin: number;
  guess: {
    period: string;
    joined: number[] | null;
    last: { period: string; hits: number | null } | null;
    cost: number;
    maxPick: number;
    pool: number[];
  };
}
