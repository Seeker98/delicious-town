import { z } from 'zod';

export const storeQuery = z.object({ type: z.coerce.number().int().min(0).max(20).optional() });
export const useBody = z.object({
  goodsId: z.number().int().positive(),
  num: z.number().int().min(1).max(99).default(1),
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
  sellPrice: number | null;
}

export interface StoreDto {
  kinds: number;
  storeNum: number;
  items: StoreItemDto[];
}

export interface LedgerRecordDto {
  kind: string;
  itemId: number | null;
  delta: number;
  source: string;
  at: string;
}
