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

/** 打理得到的食材（实际到账的数量） */
export interface AcquireTendDto {
  foods: Array<{ id: number; num: number }>;
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
  /** 税率：确认框算对方得多少 */
  taxRate: number;
  protectedUntil: string | null;
  /** 我能不能强收：能为 null；不能时是原因（no_state = 还不到 2 星、没有身价） */
  acquireBlock: string | null;
  /** 我能不能买挂牌：同上 */
  listedBlock: string | null;
}

/** 名下的一家店：再加昨天给我的分红、今天打理没有 */
export interface AcquireHoldingDto extends AcquireBriefDto {
  /** 昨天这家给我的分红（压过封顶以后的）；没发（不满轮数、昨天还不归我）为 null */
  dividend: { coin: number; tended: boolean } | null;
  tendedToday: boolean;
}

export interface AcquireViewDto {
  me: AcquireRestDto;
  /** 我今天替老板打理过没有 */
  tendedToday: boolean;
  holdings: AcquireHoldingDto[];
  maxHoldings: number;
  taxRate: number;
  listMinRate: number;
  listDays: number;
  protectDays: number;
  dividendRate: number;
  tendBonus: number;
  tendFoods: number;
}

export interface AcquireInvestRowDto {
  restId: number;
  name: string;
  /** 名下几家 */
  holdings: number;
  /** 名下的店身价合计 */
  value: number;
  /** 累计收到的分红 */
  dividendTotal: number;
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
