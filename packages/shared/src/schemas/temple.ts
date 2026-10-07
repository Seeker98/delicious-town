import { z } from 'zod';

const id = z.number().int().positive();
export const missileBody = z.object({ goodsId: id, num: z.number().int().min(1).max(99) });
export const exploreBody = z.object({ goodsId: id, times: z.number().int().min(1).max(99) });
export const trialPrepareBody = z.object({ way: z.union([z.literal(1), z.literal(2)]) });
export const trialRefreshBody = z.object({ mcId: id.optional() });
export const trialStartBody = z.object({ mainFoodsId: id, subFoodsId: id });
export const krakenFeedBody = z.object({ num: z.number().int().min(1).max(1_000_000) });
export const tentacleExchangeBody = z.object({ slot: z.number().int().min(0).max(19) });

type FoodNum = { foodsId: number; num: number };

export interface TempleDto {
  star: number;
  strength: number;
  guardian: { hpMax: number; hpLeft: number; killed: boolean };
  missiles: Array<{ goodsId: number; num: number }>;
  maps: Array<{ goodsId: number; num: number; needStrength: number }>;
  /** mcId 为 null = 没准备过；readyMinutes = 准备勋章剩余分钟，0 = 没准备好 */
  /** worthMax / expMax：本区服试炼价值、试炼经验的上限（百分比，用户 2026-10-07 起价值上限 30） */
  trial: { mcId: number | null; readyMinutes: number; creatives: number; worthMax: number; expMax: number };
  kraken: {
    targetMcId: number;
    fed: boolean;
    feedable: boolean;
    hours: Array<[number, number]>;
    current: { mcId: number; grade: number; leftNum: number; price: number } | null;
  };
  seeds: Array<{ seedId: number; num: number }>;
  tentacles: number;
}

export interface MissileResultDto {
  shots: Array<{ hit: boolean; crit: boolean; damage: number; killed: boolean }>;
  hpMax: number;
  hpLeft: number;
  killed: boolean;
  drops: {
    tickets: number;
    maps: number;
    seals: number;
    dtTickets: number;
    rare: number | null;
    foods: FoodNum[];
  };
}

export interface ExploreResultDto {
  success: number;
  fail: number;
  rare: FoodNum[];
  foods: FoodNum[];
  exp: number;
}

export interface TrialResultDto {
  success: boolean;
  lucky: boolean;
  addWorth: number;
  addExp: number;
  proficiency: number;
  curlevel: number;
}

export interface KrakenFeedDto {
  relation: 'same' | 'road' | 'other';
  favor: number;
  seeds: Array<{ seedId: number; num: number }>;
  krabCoin: number;
  tentacle: boolean;
  punish: { kind: 'exp' | 'worth' | 'forget'; value: number } | null;
}

export interface TentacleShopDto {
  slots: Array<{ mcId: number; bought: boolean }>;
  refreshes: number;
  /** 下次刷新花几条触手（当天第一次免费） */
  refreshCost: number;
  tentacles: number;
}
