import { z } from 'zod';

/** 收购（问题记录 421）的请求和返回 */
const restId = z.number().int().positive();

export const acquireBuyBody = z.object({
  restId,
  /** acquire = 按身价强收；listed = 按挂牌价买下 */
  way: z.enum(['acquire', 'listed']),
  /** 页面上看到的价格：和实际不一样时拒绝，让玩家重新确认 */
  expect: z.number().int().nonnegative(),
});
export const acquireRedeemBody = z.object({ expect: z.number().int().nonnegative() });
export const acquireRestBody = z.object({ restId });
export const acquireListBody = z.object({ restId, rate: z.number().gt(0).max(1) });
export const acquireRankQuery = z.object({ board: z.enum(['price', 'invest']).default('price') });

export interface AcquireResultDto {
  restId: number;
  price: number;
  tax: number;
  /** 原主人（或目标店自己、赎身时的老板）得到的 */
  sellerGot: number;
}
