import type { Insertable } from 'kysely';
import type { GameConfig, RestaurantDefaults } from '@dt/config';
import { levelUpExp, type RestaurantDto } from '@dt/shared';
import type { RestaurantRow, RestaurantTable, TableState } from '../../db/schema';
import type { ActiveEffect } from '../effects/service';

export const TABLES_PER_FLOOR = 16;

export function initialTables(tableNum: number): TableState[] {
  return Array.from({ length: tableNum }, (_, i) => ({
    no: i + 1,
    floor: Math.floor(i / TABLES_PER_FLOOR) + 1,
    customer: 0,
  }));
}

/** 已学食谱：下标 = 食谱 id，值 = 品级（0 未学） */
export function emptyCookbookLevels(maxCookbookId: number): Buffer {
  return Buffer.alloc(maxCookbookId + 1);
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
  };
}

export function toRestaurantDto(
  r: RestaurantRow,
  tables: TableState[],
  effects: ActiveEffect[],
  config: GameConfig,
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
    tables: tables.map((t) => ({ no: t.no, floor: t.floor, customer: t.customer })),
    effects: effects.map((e) => ({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      name: config.goods.get(e.sourceId)?.name ?? e.sourceType,
      effects: e.effects,
      expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    })),
    createdAt: r.created_at.toISOString(),
  };
}
