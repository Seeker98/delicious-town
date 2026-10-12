import type { GameConfig, Tuning } from '@dt/config';
import { nextSlot, type Rng } from '@dt/shared';
import { rollShelf } from '../../market/rules';
import { chainRow } from '../../world/chain';
import { isNight, weatherPool } from '../../world/rules';

export const WEATHER_TYPE_NAMES: Record<number, string> = { 1: '晴', 2: '雨', 3: '雪', 4: '风沙雾霾' };

/** 初始概率夹到 5%~95%（238-1 出题范围） */
export const clampP = (p: number) => Math.min(0.95, Math.max(0.05, p));

/** H 点日常货架至少上一种 level 级稀有食材（odds < 100）的概率：按进货算法模拟 n 次估算 */
export function marketRareChance(
  config: GameConfig,
  mt: Tuning['market'],
  hour: number,
  level: number,
  n: number,
  rng: Rng,
): number {
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const items = rollShelf(0, hour, config, mt, rng);
    if (
      items.some((x) => {
        const f = config.requireFood(x.foodsId);
        return f.level === level && f.odds < 100;
      })
    )
      hit++;
  }
  return hit / n;
}

/**
 * 从 now 那一刻的自然天气 fromId 出发，沿天气链一轮一轮推到 target 那一次换天，各天气大类的概率
 * （天气改版设计 §1.8：链有记忆，不能再用固定的类型占比）
 */
export function chainTypeShares(
  config: GameConfig,
  w: Tuning['world'],
  fromId: number,
  now: Date,
  target: Date,
): Map<number, number> {
  const chain = config.bundle.weatherChain;
  let dist = new Map<number, number>([[fromId, 1]]);
  let at = now;
  for (let i = 0; i < 100; i++) {
    const s = nextSlot(at, w.weatherHours);
    if (s.start > target) break;
    const nd = new Map<number, number>();
    for (const [id, p] of dist)
      for (const [k, pk] of chainRow(chain, config.weather, id, isNight(s.hour, w)))
        nd.set(k, (nd.get(k) ?? 0) + p * pk);
    dist = nd;
    at = s.start;
    if (s.start.getTime() === target.getTime()) break;
  }
  const out = new Map<number, number>();
  for (const [id, p] of dist) {
    const t = config.weather.get(id)?.type;
    if (t !== undefined) out.set(t, (out.get(t) ?? 0) + p);
  }
  return out;
}

/** 区服还没有天气时的退路：按原来天气池的权重算各大类占比（天气链的长期占比和它对齐） */
export function poolTypeShares(config: GameConfig, w: Tuning['world'], hour: number): Map<number, number> {
  const pool = weatherPool(config, isNight(hour, w), w);
  const out = new Map<number, number>();
  pool.items.forEach((x, i) => {
    const weight = pool.prefix[i]! - (i > 0 ? pool.prefix[i - 1]! : 0);
    out.set(x.type, (out.get(x.type) ?? 0) + weight / pool.total);
  });
  return out;
}

/** 判定依据里的日期：写成"11月4日"，事后看不会和"明天"混淆（238-2 终审 M4） */
export function dayLabel(day: string): string {
  return `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;
}
