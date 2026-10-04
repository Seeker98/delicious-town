import type { Food, Tuning } from '@dt/config';
import { buildPool, pickWeighted, type Rng, type WeightedPool } from '@dt/shared';

export type HandleWay = 'compose' | 'decompose';

/** 分解 2~6 级 → 下一级；合成 1~4 级 → 上一级（规格书 05 §5.4）；不能处理返回 null */
export function handleTargetLevel(way: HandleWay, level: number): number | null {
  if (way === 'decompose') return level >= 2 && level <= 6 ? level - 1 : null;
  return level >= 1 && level <= 4 ? level + 1 : null;
}

export interface HandleInput {
  way: HandleWay;
  num: number;
  star: number;
  foodCoin: number;
  /** 天气 foodsOperRate */
  weatherRate: number;
  luckRate: number;
  /** 分解：套装 operFoodsAddRate；合成：星神之泪 composeFoodsRate */
  extraRate: number;
  tuning: Tuning;
}

export interface HandleOutcome {
  chances: number;
  success: number;
  lucky: number;
  failCoin: number;
  picks: number[];
}

export function runHandle(input: HandleInput, pool: WeightedPool<Food>, rng: Rng): HandleOutcome {
  const base = input.way === 'decompose' ? input.num * 2 : Math.floor(input.num / 2);
  let chances = base;
  if (input.extraRate > 0) {
    const loops = input.way === 'decompose' ? input.num : base;
    for (let i = 0; i < loops; i++) if (rng.chance(input.extraRate)) chances += 1;
  }
  const rt = input.tuning.rest;
  const rate = rt.handleRateBase + rt.handleRatePerStar * input.star + input.weatherRate;
  const out: HandleOutcome = { chances, success: 0, lucky: 0, failCoin: 0, picks: [] };
  for (let i = 0; i < chances; i++) {
    if (rng.next() < rate) {
      out.success += 1;
      out.picks.push(pickWeighted(pool, rng).id);
    } else if (rng.chance(input.luckRate)) {
      out.success += 1;
      out.lucky += 1;
      out.picks.push(pickWeighted(pool, rng).id);
    } else {
      out.failCoin += Math.floor(input.foodCoin * input.tuning.cupboard.failCoinRate * rng.next());
    }
  }
  return out;
}

/**
 * 合成的抽取池：去掉橱柜里已经堆到上限的食材，免得合出来只能进冰箱（问题记录 290）。
 * 想靠它定向合成，要把同等级其他食材全都堆满，基本做不到，不影响稀缺平衡；全都满了时照常从整个池子抽
 */
export function composePool(
  pool: WeightedPool<Food>,
  full: (foodsId: number) => boolean,
): WeightedPool<Food> {
  const left = pool.items.filter((f) => !full(f.id));
  if (left.length === 0 || left.length === pool.items.length) return pool;
  return buildPool(left, (f) => f.weight);
}
