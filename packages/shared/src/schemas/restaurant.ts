import { z } from 'zod';

export const createRestaurantBody = z.object({ name: z.string().max(32) });

export interface TableDto {
  no: number;
  floor: number;
  /** 顾客类型（规格书 01 §1.4），0 = 空桌 */
  customer: number;
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
  effects: EffectDto[];
  createdAt: string;
}
