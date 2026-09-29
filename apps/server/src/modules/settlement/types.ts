import type { CookbookGrade, CookbookIndex, Food, Tuning } from '@dt/config';
import type { CookbookCounts, TableState } from '../../db/schema';

export interface SettleRest {
  id: number;
  level: number;
  star: number;
  oil: number;
  oilMax: number;
  coin: number;
  streetId: number;
  renown: number;
  /** 基础幸运（等级带来的） */
  luck: number;
  cteOn: boolean;
  cookfoodsFlag: number;
}

/** 当前在售的特色菜（子项目 4 提供；2A 为 null） */
export interface SpecialDish {
  price: number;
  level: number;
  leftNum: number;
}

export interface SettleInput {
  rest: SettleRest;
  tables: TableState[];
  /** 下标 = 食谱 id，值 = 品级 */
  levels: Uint8Array;
  counts: CookbookCounts;
  /** 加成汇总（含收集类派生键） */
  agg: Record<string, number>;
  special: SpecialDish | null;
  /** 食材 id → 橱柜数量；只有开了挑剔消耗食材的店才提供 */
  cupboard: ReadonlyMap<number, number> | null;
  now: Date;
}

export interface SettleGlobals {
  weather: Record<string, number>;
  krabStreet: number | null;
  planktonRestId: number | null;
  holidayMultiplier: number;
  /** 是否自然产生蟑螂：打蟑螂（friend 功能）不可用时关闭，否则蟑螂只进不出 */
  naturalRoach: boolean;
  /** 小镇祝福（子项目 4 提供；2A 为空） */
  bless: Record<string, number>;
  tuning: Tuning;
  cookbooks: CookbookIndex;
  grade(g: number): CookbookGrade;
  needFoods(cookbookId: number, grade: number): ReadonlyArray<{ foodsId: number; num: number }>;
  food(id: number): Food;
}

export interface RatePart {
  total: number;
  parts: Record<string, number>;
}

export interface Rates {
  atRate: RatePart;
  spRate: RatePart;
  coinRate: RatePart;
  expRate: RatePart;
  coinValue: RatePart;
  expValue: RatePart;
  oilRate: RatePart;
  oilValue: RatePart;
  luck: RatePart;
  /** 上座桌数 = round(上座率 × 餐桌数) */
  seated: number;
}

/** 开关型荣誉和其他系数 */
export interface Flags {
  husky: boolean;
  ali: boolean;
  flute: boolean;
  paintingTop: boolean;
  pinkBook: boolean;
  spCoinRate: number;
  mcCoinRate: number;
  mcExpRate: number;
  cookfoodSpExpRate: number;
  sqExpRate: number;
  roachMul: number;
  roachClear: number;
  luckRate: number;
}

export interface Drop {
  goodsId: number;
  num: number;
  /** 勋章有效期覆盖（小时） */
  hours?: number;
}

export interface SettleLog {
  type: string;
  params: Record<string, unknown>;
}

export interface SettleResult {
  closed: boolean;
  tables: TableState[];
  /** 本轮银币（可能为负：白食） */
  coin: number;
  exp: number;
  /** 本轮实际耗油（≥0，不超过当前油量） */
  oil: number;
  /** 顾客类型 → 桌数 */
  customers: Record<string, number>;
  rates: Rates | null;
  drops: Drop[];
  renown: number;
  foodsUsed: Array<{ foodsId: number; num: number }>;
  specialUsed: number;
  logs: SettleLog[];
  planktonAppeared: boolean;
}
