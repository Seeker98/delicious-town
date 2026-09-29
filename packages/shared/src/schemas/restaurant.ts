import { z } from 'zod';

export const createRestaurantBody = z.object({ name: z.string().max(32) });

export interface TableDto {
  no: number;
  floor: number;
  /** 顾客类型（规格书 01 §1.4），0 = 空桌 */
  customer: number;
  roach?: boolean;
  freeloaderRestId?: number;
  last?: TableResultDto;
}

export interface EffectDto {
  sourceType: string;
  sourceId: number;
  name: string;
  effects: Record<string, number>;
  expiresAt: string | null;
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
  plaque2Open: boolean;
  mainTaskStep: number;
  devices: DeviceSlotDto[];
  lastRound: RoundSummaryDto | null;
  weather: { id: number; name: string } | null;
  isPlanktonHost: boolean;
  effects: EffectDto[];
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
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PageQuery = z.infer<typeof pageQuery>;
