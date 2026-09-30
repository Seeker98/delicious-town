import { z } from 'zod';

export const storeQuery = z.object({ type: z.coerce.number().int().min(0).max(20).optional() });
export const useBody = z.object({
  goodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(999).default(1),
});
export const recordsQuery = z.object({
  range: z.enum(['1h', '6h', '12h', 'today', 'yesterday', 'before']).default('1h'),
});
export type RecordsRange = z.infer<typeof recordsQuery>['range'];

export interface StoreItemDto {
  goodsId: number;
  num: number;
  expiresAt: string | null;
  usable: boolean;
  batch: boolean;
  /** 一次最多能用几个：不能用为 0，不能批量为 1 */
  maxUse: number;
  sellPrice: number | null;
}

export interface StoreDto {
  kinds: number;
  storeNum: number;
  /** 未穿戴的厨具件数（在厨具页，占仓库格） */
  equips: number;
  items: StoreItemDto[];
}

export interface LedgerRecordDto {
  kind: string;
  itemId: number | null;
  delta: number;
  source: string;
  at: string;
}
