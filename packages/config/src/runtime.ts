import { readFileSync } from 'node:fs';
import { buildPool, gameDay, type WeightedPool } from '@dt/shared';
import { featureOfKey } from './build';
import { DEVICE_TYPE, GOODS_TYPE } from './ids';
import type { Tuning } from './tuning';
import type {
  ActivationTask,
  Award,
  ConfigBundle,
  Cookbook,
  CookbookGrade,
  Device,
  Food,
  Goods,
  OilNeed,
  StarNeed,
  Street,
  Weather,
} from './types';

export interface CookbookIndex {
  readonly maxId: number;
  /** 下标 = 食谱 id，值 = 街道；-1 = 没有这个 id */
  readonly street: Int16Array;
  /** 下标 = 食谱 id，值 = 售价 */
  readonly coin: Float64Array;
  readonly idsByStreet: ReadonlyMap<number, readonly number[]>;
  readonly allIds: readonly number[];
}

export interface GameConfig {
  readonly version: string;
  readonly bundle: ConfigBundle;
  readonly tuning: Tuning;
  readonly foods: ReadonlyMap<number, Food>;
  readonly goods: ReadonlyMap<number, Goods>;
  readonly cookbooks: ReadonlyMap<number, Cookbook>;
  readonly streets: ReadonlyMap<number, Street>;
  readonly weather: ReadonlyMap<number, Weather>;
  /** 最大食谱 id，用于确定每店已学食谱数组的长度 */
  readonly maxCookbookId: number;
  readonly foodsByLevel: ReadonlyMap<number, readonly Food[]>;
  readonly foodPools: ReadonlyMap<number, WeightedPool<Food>>;
  readonly rareFoodPools: ReadonlyMap<number, WeightedPool<Food>>;
  readonly hotFoodPool: WeightedPool<Food>;
  readonly masterFoodPool: WeightedPool<Food>;
  readonly cookbookIndex: CookbookIndex;
  readonly devices: ReadonlyMap<number, Device>;
  readonly starNeed: ReadonlyMap<number, StarNeed>;
  readonly starAward: ReadonlyMap<number, Award>;
  readonly oilNeed: ReadonlyMap<number, OilNeed>;
  readonly activationByName: ReadonlyMap<string, ActivationTask>;
  readonly guessFoodIds: ReadonlySet<number>;
  grade(g: number): CookbookGrade;
  randomGoodsIds(level: number): readonly number[];
  streetMedalId(streetId: number): number;
  isStreetMedal(g: Goods): boolean;
  holidayMultiplier(date: Date): number;
  featureOfKey(key: string): string | null;
  requireGoods(id: number): Goods;
  requireFood(id: number): Food;
  requireCookbook(id: number): Cookbook;
  requireStreet(id: number): Street;
}

function byId<T extends { id: number }>(list: T[]): Map<number, T> {
  return new Map(list.map((x) => [x.id, x]));
}

function groupBy<T, K>(list: readonly T[], key: (x: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const x of list) {
    const k = key(x);
    const arr = out.get(k) ?? [];
    arr.push(x);
    out.set(k, arr);
  }
  return out;
}

function buildCookbookIndex(cookbooks: Cookbook[]): CookbookIndex {
  const maxId = Math.max(...cookbooks.map((c) => c.id));
  const street = new Int16Array(maxId + 1).fill(-1);
  const coin = new Float64Array(maxId + 1);
  const byStreet = new Map<number, number[]>();
  const sorted = [...cookbooks].sort((a, b) => a.id - b.id);
  for (const c of sorted) {
    street[c.id] = c.streetId;
    coin[c.id] = c.coin;
    const list = byStreet.get(c.streetId) ?? [];
    list.push(c.id);
    byStreet.set(c.streetId, list);
  }
  return { maxId, street, coin, idsByStreet: byStreet, allIds: sorted.map((c) => c.id) };
}

export function createGameConfig(bundle: ConfigBundle): GameConfig {
  const goods = byId(bundle.goods);
  const foods = byId(bundle.foods);
  const cookbooks = byId(bundle.cookbooks);
  const streets = byId(bundle.streets);
  const tuning = bundle.tuning;

  const foodsByLevel = groupBy(bundle.foods, (f) => f.level);
  const foodPools = new Map<number, WeightedPool<Food>>();
  const rareFoodPools = new Map<number, WeightedPool<Food>>();
  for (const [level, list] of foodsByLevel) {
    foodPools.set(
      level,
      buildPool(list, (f) => f.odds),
    );
    rareFoodPools.set(
      level,
      buildPool(
        list.filter((f) => f.odds < 100),
        (f) => f.odds,
      ),
    );
  }

  // "热门稀缺食材"：2~5 级、稀有、在食谱需求表里出现次数超过门槛（规格书 06 §6.1）
  const needCount = new Map<number, number>();
  for (const c of bundle.cookbooks) {
    for (const list of Object.values(c.needFoods)) {
      for (const f of list) needCount.set(f.foodsId, (needCount.get(f.foodsId) ?? 0) + 1);
    }
  }
  const hot = bundle.foods.filter(
    (f) =>
      f.level >= 2 &&
      f.level <= 5 &&
      f.odds < 100 &&
      (needCount.get(f.id) ?? 0) > tuning.market.hotMinNeedCount,
  );

  const streetMedals = new Map<number, number>();
  const isStreetMedal = (g: Goods) =>
    g.type === GOODS_TYPE.honor && g.deviceType !== null && streets.has(g.deviceType) && g.deviceType <= 13;
  for (const g of bundle.goods) if (isStreetMedal(g)) streetMedals.set(g.deviceType!, g.id);

  const randomPools = new Map<number, number[]>();
  const grades = new Map(bundle.cookbookGrades.map((g) => [g.grade, g]));

  return {
    version: bundle.version,
    bundle,
    tuning,
    foods,
    goods,
    cookbooks,
    streets,
    weather: byId(bundle.weather),
    maxCookbookId: Math.max(...bundle.cookbooks.map((c) => c.id)),
    foodsByLevel,
    foodPools,
    rareFoodPools,
    hotFoodPool: buildPool(hot, (f) => f.odds),
    masterFoodPool: buildPool(foodsByLevel.get(9) ?? [], (f) => f.odds),
    cookbookIndex: buildCookbookIndex(bundle.cookbooks),
    devices: byId(bundle.devices),
    starNeed: new Map(bundle.starNeed.map((s) => [s.star, s])),
    starAward: new Map(bundle.starAward.map((s) => [s.star, s.award])),
    oilNeed: new Map(bundle.oilNeed.map((o) => [o.level, o])),
    activationByName: new Map(bundle.activationTasks.map((a) => [a.name, a])),
    guessFoodIds: new Set(bundle.marketGuessFoods),
    grade(g) {
      const x = grades.get(g);
      if (!x) throw new Error(`unknown cookbook grade ${g}`);
      return x;
    },
    randomGoodsIds(level) {
      let pool = randomPools.get(level);
      if (!pool) {
        pool = bundle.goods
          .filter((g) => g.type !== GOODS_TYPE.equip && g.awardFlag !== null && g.awardFlag <= level)
          .map((g) => g.id);
        randomPools.set(level, pool);
      }
      return pool;
    },
    streetMedalId(streetId) {
      const id = streetMedals.get(streetId);
      if (id === undefined) throw new Error(`no street medal for street ${streetId}`);
      return id;
    },
    isStreetMedal,
    holidayMultiplier(date) {
      const day = gameDay(date);
      const mmdd = day.slice(5);
      const h = bundle.holidays;
      let m = 0;
      if (h.solar[mmdd] !== undefined || h.qingming[day.slice(0, 4)] === mmdd) m += h.solarMultiplier;
      if (h.lunar[day] !== undefined) m += h.lunarMultiplier;
      return m === 0 ? 1 : m;
    },
    featureOfKey(key) {
      return featureOfKey(key, bundle.actionMap.features);
    },
    requireGoods(id) {
      const g = goods.get(id);
      if (!g) throw new Error(`unknown goods ${id}`);
      return g;
    },
    requireFood(id) {
      const f = foods.get(id);
      if (!f) throw new Error(`unknown food ${id}`);
      return f;
    },
    requireCookbook(id) {
      const c = cookbooks.get(id);
      if (!c) throw new Error(`unknown cookbook ${id}`);
      return c;
    },
    requireStreet(id) {
      const s = streets.get(id);
      if (!s) throw new Error(`unknown street ${id}`);
      return s;
    },
  };
}

export function loadGameConfig(path: string): GameConfig {
  return createGameConfig(JSON.parse(readFileSync(path, 'utf8')) as ConfigBundle);
}

/** 道具效果持续小时数：invalidhour 优先，其次 value.time；都没有 = 永久 */
export function goodsEffectHours(g: Goods): number | null {
  if (g.invalidHours !== null) return g.invalidHours;
  const time =
    typeof g.value === 'object' && g.value !== null ? (g.value as { time?: unknown }).time : undefined;
  return typeof time === 'number' ? time : null;
}

/** 设施摆放的基础时长（小时）：value.time 优先，其次 invalidhour；牌匾返回 null（永久） */
export function deviceHours(g: Goods): number | null {
  if (g.deviceType === DEVICE_TYPE.plaque) return null;
  const time =
    typeof g.value === 'object' && g.value !== null ? (g.value as { time?: unknown }).time : undefined;
  if (typeof time === 'number') return time;
  return g.invalidHours;
}
