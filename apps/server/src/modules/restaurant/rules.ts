import type { Insertable } from 'kysely';
import type { GameConfig, RestaurantDefaults } from '@dt/config';
import {
  levelUpExp,
  type ActiveBoostDto,
  type DeviceSlotDto,
  type HeadlinesDto,
  type RestaurantDto,
  type RoundSummaryDto,
} from '@dt/shared';
import type { RestaurantRow, RestaurantTable, TableState } from '../../db/schema';
import type { ActiveEffect } from '../effects/service';
import { tableDto } from './reads';
import { effectSourceName } from '../effects/naming';

export const TABLES_PER_FLOOR = 16;

export function initialTables(tableNum: number): TableState[] {
  return Array.from({ length: tableNum }, (_, i) => ({
    no: i + 1,
    floor: Math.floor(i / TABLES_PER_FLOOR) + 1,
    customer: 0,
  }));
}

/** 已学食谱：下标 = 食谱 id，值 = 品级（0 未学） */
export function emptyCookbookLevels(slots: number): Buffer {
  return Buffer.alloc(slots);
}

export function newRestaurantValues(
  shardId: number,
  accountId: number,
  name: string,
  d: RestaurantDefaults,
): Insertable<RestaurantTable> {
  return {
    shard_id: shardId,
    account_id: accountId,
    name,
    level: d.level,
    coin: d.coin,
    diamond: d.diamond,
    strength: d.strength,
    strength_max: d.strengthMax,
    oil: d.oil,
    oil_max: d.oilMax,
    street_id: d.streetId,
    renown: d.renown,
    attr_left: d.attrLeft,
    luck: d.level - 1,
    table_num: d.tableNum,
    cupboard_num: d.cupboardNum,
    store_num: d.storeNum,
    foods_max_num: d.foodsMaxNum,
    foods_lock_num: d.foodsLockNum,
    // 新店没有老进度要换算，直接记新任务版本（backlog 318）
    quest_version: 1,
  };
}

export interface OverviewExtra {
  devices: DeviceSlotDto[];
  lastRound: RoundSummaryDto | null;
  weather: { id: number; name: string } | null;
  isPlanktonHost: boolean;
  /** 展示中的个性图标（问题记录：自己看不到称号） */
  icons: Array<{ key: string; title: string }>;
  plaque2Cost: { star: number; coin: number; diamond: number };
  /** 挑剔消耗食材每档保留的数量（区服数值，问题记录 220） */
  cookfoodsPerFlag: number;
  headlines: HeadlinesDto;
  disabledFeatures: string[];
  boosts: ActiveBoostDto[];
}

export function toRestaurantDto(
  r: RestaurantRow,
  tables: TableState[],
  effects: ActiveEffect[],
  config: GameConfig,
  extra: OverviewExtra,
): RestaurantDto {
  return {
    id: r.id,
    shardId: r.shard_id,
    name: r.name,
    level: r.level,
    exp: r.exp,
    expToNext: levelUpExp(r.level),
    coin: r.coin,
    diamond: r.diamond,
    strength: r.strength,
    strengthMax: r.strength_max,
    oil: r.oil,
    oilMax: r.oil_max,
    starLevel: r.star_level,
    streetId: r.street_id,
    streetName: config.streets.get(r.street_id)?.name ?? '',
    renown: r.renown,
    attrLeft: r.attr_left,
    attrs: {
      cook: r.attr_cook,
      cutting: r.attr_cutting,
      fire: r.attr_fire,
      season: r.attr_season,
      creatives: r.attr_creatives,
    },
    luck: r.luck,
    tableNum: r.table_num,
    cupboardNum: r.cupboard_num,
    storeNum: r.store_num,
    foodsMaxNum: r.foods_max_num,
    foodsLockNum: r.foods_lock_num,
    tables: tables.map((t) => tableDto(t)),
    oilLevel: r.oil_level,
    state: r.state,
    stateReason: r.state_reason,
    promoOn: r.promo_on,
    cteOn: r.cte_on,
    cookfoodsFlag: r.cookfoods_flag,
    plaque2Open: r.plaque2_open,
    plaque2Cost: extra.plaque2Cost,
    cookfoodsPerFlag: extra.cookfoodsPerFlag,
    devices: extra.devices,
    lastRound: extra.lastRound,
    weather: extra.weather,
    isPlanktonHost: extra.isPlanktonHost,
    icons: extra.icons,
    door: r.door,
    avatar: r.avatar,
    effects: effects.map((e) => ({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      name: effectSourceName(e, config),
      effects: e.effects,
      expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    })),
    boosts: extra.boosts,
    headlines: extra.headlines,
    disabledFeatures: extra.disabledFeatures,
    createdAt: r.created_at.toISOString(),
  };
}
