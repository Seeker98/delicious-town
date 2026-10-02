import type { GameConfig, Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';
import { rollShelf } from '../../market/rules';
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

/** H 点自动轮换时各天气类型的占比（按天气池权重） */
export function weatherTypeShares(config: GameConfig, w: Tuning['world'], hour: number): Map<number, number> {
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
