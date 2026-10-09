import { z } from 'zod';
import type { BoostItem } from '../boost';
import type { HeadlinesDto } from './town';

export const createRestaurantBody = z.object({ name: z.string().max(32) });

export interface TableDto {
  no: number;
  floor: number;
  /** 顾客类型（规格书 01 §1.4），0 = 空桌 */
  customer: number;
  roach?: boolean;
  /** 放蟑螂的店；自然产生的为 null */
  roachBy?: number | null;
  freeloaderRestId?: number;
  freeloaderName?: string;
  /** 白食开始时间 */
  freeloaderSince?: string;
  last?: TableResultDto;
}

/** 付钱的顾客类型：普通、挑剔、章鱼哥、痞老板、蟹老板（不算空桌、蟑螂、白食）；结算和收益记录的“客人”列共用 */
export const PAYING_CUSTOMERS: readonly number[] = [1, 2, 6, 7, 8];

export interface EffectDto {
  sourceType: string;
  sourceId: number;
  name: string;
  effects: Record<string, number>;
  expiresAt: string | null;
}

/** 正在生效的全服加成活动（问题记录 294）：它直接改区服数值，不是加成来源，单独列 */
export interface ActiveBoostDto {
  id: number;
  title: string;
  items: BoostItem[];
  endsAt: string;
}

export interface RestaurantDto {
  id: number;
  shardId: number;
  name: string;
  level: number;
  exp: number;
  expToNext: number;
  coin: number;
  diamond: number;
  strength: number;
  strengthMax: number;
  oil: number;
  oilMax: number;
  starLevel: number;
  streetId: number;
  streetName: string;
  renown: number;
  attrLeft: number;
  attrs: { cook: number; cutting: number; fire: number; season: number; creatives: number };
  luck: number;
  tableNum: number;
  cupboardNum: number;
  storeNum: number;
  foodsMaxNum: number;
  foodsLockNum: number;
  tables: TableDto[];
  oilLevel: number;
  /** 1 营业，2 停业 */
  state: number;
  stateReason: string | null;
  promoOn: boolean;
  cteOn: boolean;
  cookfoodsFlag: number;
  /** 挑剔消耗食材每档保留的数量：N 档表示每种食材至少留 N × 这个数（问题记录 220） */
  cookfoodsPerFlag: number;
  plaque2Open: boolean;
  /** 第二块牌匾位的开通条件（区服数值） */
  plaque2Cost: { star: number; coin: number; diamond: number };
  devices: DeviceSlotDto[];
  lastRound: RoundSummaryDto | null;
  weather: { id: number; name: string } | null;
  isPlanktonHost: boolean;
  /** 展示中的个性图标 */
  icons: Array<{ key: string; title: string }>;
  door: number;
  /** null = 没设置头像 */
  avatar: number | null;
  effects: EffectDto[];
  boosts: ActiveBoostDto[];
  /** 首页小镇新闻：最新 3 条 + 最新广播 */
  headlines: HeadlinesDto;
  /** 首页餐厅动态：最近 3 天里最新的 3 条，新的在前（问题记录 553） */
  feed: RestLogDto[];
  /** 本区服后台关掉的功能，前端据此隐藏入口（问题记录 248） */
  disabledFeatures: string[];
  /** 被收购时的老板（首页提示，收购 PR 3）；区服关了收购时为 null */
  acquireOwner: { restId: number; name: string } | null;
  /** 资产：名下的店身价合计，和投资榜一样（问题记录 447）；区服关了收购为 null */
  assets: number | null;
  /** 首页的食谱数：学会几道 / 全部几道（问题记录 447） */
  cookbooks: { learned: number; total: number };
  /** 在售的特色菜：哪道、几级；没有、卖完为 null（问题记录 447） */
  special: { id: number; level: number } | null;
  createdAt: string;
}

export interface TableResultDto {
  type: number;
  coin: number;
  exp: number;
  oil: number;
  req?: number;
  grade?: number;
  cookbookId?: number;
  satisfied?: boolean;
}

export interface DeviceSlotDto {
  slot: number;
  name: string;
  deviceType: number;
  needStar: number;
  unlocked: boolean;
  goodsId: number | null;
  expiresAt: string | null;
}

export interface RoundSummaryDto {
  roundNo: number;
  coin: number;
  exp: number;
  oil: number;
  customers: Record<string, number>;
  at: string;
}

export interface IncomePageDto {
  items: RoundSummaryDto[];
  nextBefore: string | null;
  /** 今天（北京时间）的小计，只在第一页给（问题记录 530：收益记录页优化） */
  today?: { rounds: number; coin: number; exp: number; oil: number };
}

export interface RateBreakdownDto {
  total: number;
  parts: Record<string, number>;
}

export interface BuffsDto {
  roundNo: number | null;
  rates: Record<string, RateBreakdownDto> | null;
  seated: number | null;
  sources: EffectDto[];
}

export interface RestLogDto {
  type: string;
  params: Record<string, unknown>;
  at: string;
}

export interface LogPageDto {
  items: RestLogDto[];
  nextBefore: string | null;
}

export const pageQuery = z.object({
  /** 分页游标：上一页返回的 nextBefore，格式"时间~id"（也接受只有时间） */
  before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z(~\d+)?$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PageQuery = z.infer<typeof pageQuery>;
