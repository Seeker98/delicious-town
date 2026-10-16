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
/** 挂牌价比例：身价的 50%~120%（区服数值可调，最高 5 倍），5% 一档 */
export const acquireListBody = z.object({ restId, rate: z.number().gt(0).max(5) });
export const acquireRankQuery = z.object({ board: z.enum(['price', 'invest']).default('price') });

/** 一笔钱怎么分（收购改版 2026-10-16）：给卖方（老板）、给店自己、销毁、税，四项加起来是价格 */
export interface AcquireSplitDto {
  sellerGot: number;
  storeGot: number;
  burn: number;
  tax: number;
}

export interface AcquireResultDto extends AcquireSplitDto {
  restId: number;
  price: number;
}

/** 老板打理一家：付了多少（销毁）、送店几个补给包 */
export interface AcquireTendDto {
  restId: number;
  cost: number;
  packs: number;
}

/** 全部打理：打理了哪几家、合计付了多少 */
export interface AcquireTendAllDto {
  items: AcquireTendDto[];
  cost: number;
}

/** 一家店的收购摘要：榜单、名下的店、在售都用 */
export interface AcquireBriefDto {
  restId: number;
  name: string;
  level: number;
  star: number;
  base: number;
  /** 日均 = 基础身价 ÷ 倍数（打理成本、补给包、让渡估算都按它） */
  avg: number;
  heat: number;
  price: number;
  owner: { restId: number; name: string } | null;
  listed: { rate: number; price: number; until: string } | null;
}

/** 对方餐厅页、我的身价：再加保护期、“我能不能收”、两种买法各怎么分 */
export interface AcquireRestDto extends AcquireBriefDto {
  protectedUntil: string | null;
  /** 我能不能强收：能为 null；不能时是原因（no_state = 还不到 2 星、没有身价） */
  acquireBlock: string | null;
  /** 我能不能买挂牌：同上 */
  listedBlock: string | null;
  /** 按身价强收怎么分（有老板的店不能强收，为 null） */
  acquireSplit: AcquireSplitDto | null;
  /** 按挂牌价买下怎么分（没挂牌为 null） */
  listedSplit: AcquireSplitDto | null;
}

/** 名下的一家：今天打理没有、几天没打理、现在的抽成比例、今天攒下的、昨天到账的、打理一次的成本和补给包 */
export interface AcquireHoldingDto extends AcquireBriefDto {
  tendedToday: boolean;
  idleDays: number;
  cedeRate: number;
  /** 今天已经让给我的（明天 00:05 发） */
  pending: number;
  /** 昨天让给我的；还没发为 null（今天的任务还没跑完） */
  yesterday: number | null;
  tendCost: number;
  tendPacks: number;
}

/** 我被收购时：今天让了多少、近 30 天让了多少、现在的抽成、老板打理的情况、赎身价和怎么分 */
export interface AcquireOwnedDto {
  since: string | null;
  cededToday: number;
  ceded30: number;
  cedeRate: number;
  tendedToday: boolean;
  /** 老板今天打理的时间；没打理为 null */
  tendedAt: string | null;
  /** 今天打理送了我几个补给包 */
  packsToday: number;
  /** 近 7 天（含今天）老板打理了几天 */
  tendDays7: number;
  idleDays: number;
  redeemPrice: number;
  redeemSplit: AcquireSplitDto;
}

/** 收购规则里的数（规则面板、提示用） */
export interface AcquireRulesDto {
  minStar: number;
  buyerMinStar: number;
  buyerMinAccountDays: number;
  buyerMaxPerDay: number;
  maxHoldings: number;
  maxPerDay: number;
  newStarProtectDays: number;
  protectDays: number;
  priceMultiple: number;
  heatStep: number;
  taxRate: number;
  firstStoreRate: number;
  firstBurnRate: number;
  resaleStoreRate: number;
  redeemBurnRate: number;
  cedeRate: number;
  cedeTendRate: number;
  tendMultiplier: number;
  tendCostRate: number;
  tendPackStep: number;
  tendPackMax: number;
  tendHalfDays: number;
  tendStopDays: number;
  tendReleaseDays: number;
  listMinRate: number;
  listMaxRate: number;
  listDays: number;
}

export interface AcquireViewDto {
  me: AcquireRestDto;
  /** 我被收购了：让渡、打理、赎身；没被收购为 null */
  owned: AcquireOwnedDto | null;
  /** 今天的发放任务跑完了（名下店的“昨天到账”已发）；没跑完时页面写“还没发”，不写 0 */
  dividendPaid: boolean;
  holdings: AcquireHoldingDto[];
  /** 名下店今天合计攒下的、昨天合计到账的 */
  pendingTotal: number;
  yesterdayTotal: number;
  /** 我今天已经收购、买下几家 */
  boughtToday: number;
  rules: AcquireRulesDto;
}

export interface AcquireInvestRowDto {
  restId: number;
  name: string;
  /** 名下几家 */
  holdings: number;
  /** 名下的店身价合计 */
  value: number;
  /** 累计收到的抽成（原来的分红） */
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
