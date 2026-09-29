import { readFileSync } from 'node:fs';
import type { ConfigBundle, Cookbook, Food, Goods, Street, Weather } from './types';

export interface GameConfig {
  readonly version: string;
  readonly bundle: ConfigBundle;
  readonly foods: ReadonlyMap<number, Food>;
  readonly goods: ReadonlyMap<number, Goods>;
  readonly cookbooks: ReadonlyMap<number, Cookbook>;
  readonly streets: ReadonlyMap<number, Street>;
  readonly weather: ReadonlyMap<number, Weather>;
  /** 最大食谱 id，用于确定每店已学食谱数组的长度 */
  readonly maxCookbookId: number;
  requireGoods(id: number): Goods;
  requireStreet(id: number): Street;
}

function byId<T extends { id: number }>(list: T[]): Map<number, T> {
  return new Map(list.map((x) => [x.id, x]));
}

export function createGameConfig(bundle: ConfigBundle): GameConfig {
  const goods = byId(bundle.goods);
  const streets = byId(bundle.streets);
  return {
    version: bundle.version,
    bundle,
    foods: byId(bundle.foods),
    goods,
    cookbooks: byId(bundle.cookbooks),
    streets,
    weather: byId(bundle.weather),
    maxCookbookId: Math.max(...bundle.cookbooks.map((c) => c.id)),
    requireGoods(id) {
      const g = goods.get(id);
      if (!g) throw new Error(`unknown goods ${id}`);
      return g;
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
