import { z } from 'zod';
import { SHARED_FOODS } from '../goodsIds';

export const foodsIdBody = z.object({ foodsId: z.number().int().positive() });
export const handleBody = z.object({
  foodsId: z.number().int().positive(),
  way: z.enum(['compose', 'decompose']),
  num: z.number().int().min(1).max(100),
});
export const exchangeBody = z.object({
  foodsId: z.union([z.literal(SHARED_FOODS.masterLevel1), z.literal(SHARED_FOODS.masterLevel2)]),
  times: z.number().int().min(1).max(50),
});

export interface CupboardFoodDto {
  foodsId: number;
  num: number;
  locked: boolean;
  /** 本街食谱升到目标品级还需要多少 */
  streetNeed: number;
}

export interface CupboardDto {
  slotsUsed: number;
  slots: number;
  lockUsed: number;
  lockSlots: number;
  foodsMaxNum: number;
  targetGrade: number;
  fridgeCount: number;
  fridgeUnread: boolean;
  freeHandleLeft: number;
  /** 一次最多分解 / 合成几个 */
  handleMax: number;
  items: CupboardFoodDto[];
}

export interface FridgeDto {
  /** thawable：现在能解冻几个（受橱柜单种上限、空格限制）；thawCoin：解冻这些要花的银币（问题记录 206） */
  items: Array<{ foodsId: number; num: number; thawable: number; thawCoin: number }>;
}

export interface HandleResultDto {
  chances: number;
  success: number;
  lucky: number;
  failCoin: number;
  strengthUsed: number;
  gained: Array<{ foodsId: number; num: number }>;
}

export interface ThawResultDto {
  foodsId: number;
  moved: number;
  coin: number;
}
