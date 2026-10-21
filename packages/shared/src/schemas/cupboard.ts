import { z } from 'zod';
import { SHARED_FOODS } from '../goodsIds';

export const foodsIdBody = z.object({ foodsId: z.number().int().positive() });
/** 主动把橱柜里的食材放进冰箱（冰箱收费 2026-10-22） */
export const freezeBody = z.object({
  foodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(99_999),
});
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
  /** 冰箱里已有几个（放冰箱时判断会不会多占一格） */
  fridge: number;
  /** 冰箱计费用的单价：菜场价（不含天气） */
  price: number;
}

/**
 * 冰箱费用（冰箱收费 2026-10-22）：kinds 格数、value 冰箱里食材按菜场价的合计、mult 这一档的倍数、
 * daily 每天的仓储费；tiers 是 [从第几格起, 倍数]，到这一档时整个冰箱都乘
 */
export interface FridgeFeeDto {
  kinds: number;
  value: number;
  mult: number;
  daily: number;
  debt: number;
  /** 从哪个游戏日开始欠；不欠时 null */
  debtSince: string | null;
  /** 连续欠满几天开始用冰箱里的食材抵债 */
  debtDays: number;
  entryRate: number;
  dailyRate: number;
  thawRate: number;
  tiers: Array<[number, number]>;
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
  /** 万能食材一次最多换几次（区服数值 cupboard.exchangeMaxTimes） */
  exchangeMaxTimes: number;
  fridgeFee: FridgeFeeDto;
  items: CupboardFoodDto[];
}

export interface FridgeDto {
  /**
   * thawable：现在能解冻几个（受橱柜单种上限、空格限制）；thawCoin：解冻这些要花的银币（问题记录 206）；
   * streetNeed：本街的菜还需要几个，和橱柜一样（问题记录 465）
   */
  items: Array<{ foodsId: number; num: number; thawable: number; thawCoin: number; streetNeed: number }>;
  fee: FridgeFeeDto;
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
  /** 解冻前先补清的欠费 */
  debtPaid: number;
}

export interface FreezeResultDto {
  foodsId: number;
  moved: number;
  /** 入库费 */
  coin: number;
}
