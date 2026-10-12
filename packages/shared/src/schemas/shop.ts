import { z } from 'zod';

export const buyBody = z.object({
  goodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(999),
});
export const buySpecialBody = z.object({ num: z.number().int().min(1).max(999) });
export const sellBody = buyBody;
export const discardBody = z.object({ goodsId: z.number().int().positive() });

/** 买不了的原因：钱不够、到持有上限、已拥有（永久勋章 / 牌匾）、仓库满 */
/** star：餐厅星级不够（问题记录 146 的后期海报奖杯） */
/** daily：今天的限购买满了（天气改版：晴雨签每天 1 个） */
export type BuyBlock = 'money' | 'max' | 'owned' | 'store' | 'star' | 'daily' | null;

export interface ShopItemDto {
  goodsId: number;
  price: number;
  owned: number;
  /** 一次最多能买几个；null = 不限（受持有上限） */
  limit: number | null;
  /** 现在一次最多能买几个（银币 / 钻石、持有上限、仓库容量都算上）；0 = 买不了 */
  maxBuy: number;
  blocked: BuyBlock;
  /** 需要的星级，只有有门槛的道具才有（问题记录 146） */
  needStar?: number;
  /** 每日限购（tuning.shop.dailyLimit）：每天几个、今天还能买几个；不限购的没有这一项 */
  daily?: { limit: number; left: number };
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
