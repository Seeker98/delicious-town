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
  /** 同一设备或网络本轮已经买了多少（限购按店、设备、网络分别算，取最多的那个） */
  sharedBought: number;
  /** 橱柜里已有多少 */
  have: number;
  /** 现在最多还能买几个：限购剩余、库存剩余、橱柜单种上限剩余取小（橱柜格子满且没有这种食材时为 0） */
  canBuy: number;
  openedAt: string;
  /** 菜场工作证手动进货的货（4E-2）：进货人；系统货为 null */
  owner: { restId: number; name: string } | null;
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
  /** 橱柜单种食材上限；橱柜格子是否满了 */
  foodsMaxNum: number;
  cupboardFull: boolean;
  /** 手动进货：是否持有有效的菜场工作证、本次费用 */
  manual: { hasCard: boolean; cost: number };
  guess: {
    period: string;
    joined: number[] | null;
    last: { period: string; hits: number | null } | null;
    cost: number;
    maxPick: number;
    pool: number[];
  };
}

export interface ManualStockDto {
  foods: number[];
  cost: number;
  renown: number;
}
