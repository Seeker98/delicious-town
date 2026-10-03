import type { GameConfig, ShardSettings, Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';
import type { CookbookCounts, TableState } from '../../db/schema';
import { initialTables } from '../../modules/restaurant/rules';
import { normalizeCounts } from '../../modules/settlement/globals';

export interface FastEffect {
  sourceType: string;
  sourceId: number;
  effects: Record<string, number>;
  expiresAt: Date | null;
}

/** 一家店在内存里的样子：只放影响主线的字段（快速模拟设计 §4.3） */
export interface FastRest {
  id: number;
  level: number;
  exp: number;
  coin: number;
  diamond: number;
  strength: number;
  strengthMax: number;
  oil: number;
  oilMax: number;
  oilLevel: number;
  star: number;
  tableNum: number;
  attrLeft: number;
  attrCook: number;
  attrCutting: number;
  attrFire: number;
  luck: number;
  renown: number;
  streetId: number;
  /** 1 营业，2 停业 */
  state: 1 | 2;
  cupboardNum: number;
  storeNum: number;
  foodsMaxNum: number;
  foodsLockNum: number;
  plaque2Open: boolean;
  cookfoodsFlag: number;
  cteOn: boolean;
  tables: TableState[];
  levels: Uint8Array;
  counts: CookbookCounts;
  /** 每学一次菜 +1；用来缓存"学到 1 品级还要的食材"（只在学菜后变化） */
  levelsVersion: number;
  /** version = "已学版本:街道"（问题记录 312：需求只算本街） */
  needCache: { version: string; need: Map<number, number> } | null;
  /** 橱柜每变一次 +1；上次学菜什么都没学到、橱柜和食谱都没变时跳过学菜（性能） */
  foodsVersion: number;
  learnIdleKey: string;
  /** 道具 id → 数量和勋章有效期 */
  store: Map<number, { num: number; expiresAt: Date | null }>;
  foods: Map<number, number>;
  fridge: Map<number, number>;
  /** 设施格 → 摆的设施 */
  devices: Map<number, { goodsId: number; expiresAt: Date | null }>;
  effects: FastEffect[];
  aggCache: Record<string, number> | null;
  aggDirty: boolean;
  aggNextExpire: Date | null;
  /** 已领的主线、支线任务和章末标记，对应 quest_done（问题记录 318） */
  questDone: Set<number>;
  /** 全历史行为计数（任务用），对应 event_counter */
  counters: Map<string, number>;
  /** 当日计数（签到、活跃、领奖、合成次数），对应 daily_counter；跨天时整体清空 */
  daily: Map<string, number>;
  day: string;
  planktonCooldownUntil: Date | null;
}

export interface Income {
  coin: number;
  exp: number;
  diamond: number;
}

export interface FastStats {
  /** 来源 → 累计收入（只记正数） */
  income: Record<string, Income>;
}

export interface FastCtx {
  config: GameConfig;
  tuning: Tuning;
  now: Date;
  rng: Rng;
  stats: FastStats;
}

/** 空店：字段初值和 restaurant/rules.ts 的 newRestaurantValues、数据库默认值一致；开店礼包见 ops.openFastRest */
export function newFastRest(id: number, config: GameConfig, settings: ShardSettings): FastRest {
  const d = settings.restaurant;
  return {
    id,
    level: d.level,
    exp: 0,
    coin: d.coin,
    diamond: d.diamond,
    strength: d.strength,
    strengthMax: d.strengthMax,
    oil: d.oil,
    oilMax: d.oilMax,
    oilLevel: 0,
    star: 0,
    tableNum: d.tableNum,
    attrLeft: d.attrLeft,
    attrCook: 0,
    attrCutting: 0,
    attrFire: 0,
    luck: d.level - 1,
    renown: d.renown,
    streetId: d.streetId,
    state: 1,
    cupboardNum: d.cupboardNum,
    storeNum: d.storeNum,
    foodsMaxNum: d.foodsMaxNum,
    foodsLockNum: d.foodsLockNum,
    plaque2Open: false,
    cookfoodsFlag: 0,
    cteOn: false,
    tables: initialTables(d.tableNum),
    levels: new Uint8Array(config.maxCookbookId + 1),
    counts: normalizeCounts({}),
    levelsVersion: 0,
    needCache: null,
    foodsVersion: 0,
    learnIdleKey: '',
    store: new Map(),
    foods: new Map(),
    fridge: new Map(),
    devices: new Map(),
    effects: [],
    aggCache: null,
    aggDirty: true,
    aggNextExpire: null,
    questDone: new Set(),
    counters: new Map(),
    daily: new Map(),
    day: '',
    planktonCooldownUntil: null,
  };
}
