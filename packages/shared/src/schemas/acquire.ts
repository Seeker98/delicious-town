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

/** 一家店的收购摘要：榜单、名下的店、在售都用 */
export interface AcquireBriefDto {
  restId: number;
  name: string;
  level: number;
  star: number;
  base: number;
  heat: number;
  price: number;
  owner: { restId: number; name: string } | null;
  listed: { rate: number; price: number; until: string } | null;
}

/** 对方餐厅页、我的身价：再加保护期和“我能不能收” */
export interface AcquireRestDto extends AcquireBriefDto {
  protectedUntil: string | null;
  /** 我能不能强收：能为 null；不能时是原因（no_state = 还不到 2 星、没有身价） */
  acquireBlock: string | null;
  /** 我能不能买挂牌：同上 */
  listedBlock: string | null;
}

export interface AcquireViewDto {
  me: AcquireRestDto;
  holdings: AcquireBriefDto[];
  maxHoldings: number;
  taxRate: number;
  listMinRate: number;
  listDays: number;
  protectDays: number;
}

export interface AcquireInvestRowDto {
  restId: number;
  name: string;
  /** 名下几家 */
  holdings: number;
  /** 名下的店身价合计 */
  value: number;
}

/** 身价榜、投资榜：board 指定的那个有数，另一个是空数组 */
export interface AcquireRankDto {
  board: 'price' | 'invest';
  price: AcquireBriefDto[];
  invest: AcquireInvestRowDto[];
}

export interface AcquireMarketDto {
  items: AcquireBriefDto[];
}
