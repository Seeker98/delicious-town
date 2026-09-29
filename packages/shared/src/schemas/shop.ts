import { z } from 'zod';

export const buyBody = z.object({
  goodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(999),
});
export const buySpecialBody = z.object({ num: z.number().int().min(1).max(999) });
export const sellBody = buyBody;
export const discardBody = z.object({ goodsId: z.number().int().positive() });

export interface ShopItemDto {
  goodsId: number;
  price: number;
  owned: number;
  /** 一次最多能买几个；null = 不限（受持有上限） */
  limit: number | null;
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
