import { z } from 'zod';

export const buyBody = z.object({
  goodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(999),
});
export const buySpecialBody = z.object({ num: z.number().int().min(1).max(999) });
export const sellBody = buyBody;
export const discardBody = z.object({ goodsId: z.number().int().positive() });

/** 买不了的原因：钱不够、到持有上限、已拥有（永久勋章 / 牌匾）、仓库满 */
export type BuyBlock = 'money' | 'max' | 'owned' | 'store' | null;

export interface ShopItemDto {
  goodsId: number;
  price: number;
  owned: number;
  /** 一次最多能买几个；null = 不限（受持有上限） */
  limit: number | null;
  /** 现在一次最多能买几个（银币 / 钻石、持有上限、仓库容量都算上）；0 = 买不了 */
  maxBuy: number;
  blocked: BuyBlock;
}

export interface ShopDto {
  coin: ShopItemDto[];
  black: ShopItemDto[];
}

export interface ShopSpecialDto {
  day: string;
  goodsId: number;
  tierName: string;
  discount: number;
  price: number;
  stock: number;
  sold: number;
}
