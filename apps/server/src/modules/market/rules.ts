import type { Food, GameConfig, Tuning } from '@dt/config';
import { buildPool, pickWeighted, type Rng, type WeightedPool } from '@dt/shared';

export type Shelf = 0 | 1 | 2;

export interface ShelfItem {
  foodsId: number;
  stock: number;
  hot: boolean;
}

type MarketTuning = Tuning['market'];

function pickLevel(weights: Array<[number, number]>, rng: Rng): number {
  return pickWeighted(
    buildPool(weights, (w) => w[1]),
    rng,
  )[0];
}

/** 货架进货（规格书 06 §6.1）：每种按 odds 在该等级里抽，同一批不重复 */
export function rollShelf(
  shelf: Shelf,
  hour: number,
  config: GameConfig,
  t: MarketTuning,
  rng: Rng,
): ShelfItem[] {
  const used = new Set<number>();
  const pickDistinct = (pool: WeightedPool<Food> | undefined): Food | null => {
    if (!pool || pool.total <= 0) return null;
    for (let i = 0; i < 20; i++) {
      const f = pickWeighted(pool, rng);
      if (!used.has(f.id)) {
        used.add(f.id);
        return f;
      }
    }
    return null;
  };
  const out: ShelfItem[] = [];
  if (shelf === 0) {
    const kinds = hour === t.dailyKindsLastHour ? t.dailyKindsLast : t.dailyKinds;
    for (let k = 0; k < kinds; k++) {
      const f = pickDistinct(config.foodPools.get(pickLevel(t.dailyLevelWeights, rng)));
      if (f) out.push({ foodsId: f.id, stock: f.odds < 100 ? t.dailyRareStock : t.dailyStock, hot: false });
    }
  } else if (shelf === 1) {
    for (let k = 0; k < t.specialKinds; k++) {
      const f = pickDistinct(config.foodPools.get(pickLevel(t.specialLevelWeights, rng)));
      if (f) out.push({ foodsId: f.id, stock: t.specialStockBase + rng.int(t.specialStockRand), hot: false });
    }
    if (rng.chance(t.specialHotChance)) {
      const f = pickDistinct(config.hotFoodPool);
      if (f) {
        out.push({
          foodsId: f.id,
          stock: Math.floor((t.specialStockBase + rng.int(t.specialStockRand)) / 2),
          hot: true,
        });
      }
    }
  } else {
    for (let k = 0; k < t.premiumKinds; k++) {
      const f = pickDistinct(config.foodPools.get(t.premiumLevel));
      if (f) {
        out.push({
          foodsId: f.id,
          stock: f.odds < 100 ? Math.floor(t.premiumStock * t.premiumRareFactor) : t.premiumStock,
          hot: false,
        });
      }
    }
  }
  return out;
}

/** 单价（规格书 06 §6.2）：天气 marketCoin 按比例浮动 */
export function unitPrice(
  shelf: Shelf,
  food: Food,
  t: MarketTuning,
  weather: Record<string, number>,
): number {
  const w = 1 + (weather.marketCoin ?? 0);
  if (shelf === 1) return t.specialPrice * w;
  if (shelf === 2) return food.coin * t.premiumPriceFactor * w;
  return food.coin * w;
}

/** 本轮每人（账号 / 设备 / IP 分别计）限购 */
export function personLimit(shelf: Shelf, food: Food, openedAt: Date, now: Date, t: MarketTuning): number {
  const base = t.shelfLimits[shelf];
  if (shelf === 0 && food.odds < 100 && now.getTime() - openedAt.getTime() < t.rareWindowMinutes * 60_000) {
    return Math.min(base, Math.floor(food.odds * t.rareLimitOddsFactor + t.rareLimitBase));
  }
  return base;
}

/** 手动进货费用（规格书 06 §6.4）：today = 本次之前今天已进货次数 */
export function manualCost(today: number, t: MarketTuning): number {
  return t.manualCost * (1 + Math.max(today - 1, 0));
}

/** 手动进货声望：原版 count > 4 → 500；count < 2 → 花费 × 0.5 / 10000，否则 × 1 */
export function manualRenown(today: number, cost: number): number {
  if (today > 4) return 500;
  return Math.floor(((today < 2 ? 0.5 : 1) * cost) / 10000);
}
