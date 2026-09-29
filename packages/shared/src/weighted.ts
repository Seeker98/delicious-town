import type { Rng } from './rng';

export interface WeightedPool<T> {
  readonly items: readonly T[];
  readonly prefix: readonly number[];
  readonly total: number;
}

/** 按权重建池：权重 <= 0 的项被排除；prefix[i] = 前 i+1 项的权重和 */
export function buildPool<T>(items: readonly T[], weight: (item: T) => number): WeightedPool<T> {
  const kept: T[] = [];
  const prefix: number[] = [];
  let total = 0;
  for (const item of items) {
    const w = weight(item);
    if (!(w > 0)) continue;
    total += w;
    kept.push(item);
    prefix.push(total);
  }
  return { items: kept, prefix, total };
}

/** r ∈ [0, total)，选第一个 prefix > r 的项（等价于旧版 rateMax - odds <= r < rateMax） */
export function pickWeighted<T>(pool: WeightedPool<T>, rng: Rng): T {
  if (pool.total <= 0) throw new Error('cannot pick from an empty pool');
  const r = rng.next() * pool.total;
  let lo = 0;
  let hi = pool.prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pool.prefix[mid]! > r) hi = mid;
    else lo = mid + 1;
  }
  return pool.items[lo]!;
}
