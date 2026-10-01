import type { GameConfig, Tuning, Weather } from '@dt/config';
import { buildPool, pickWeighted, type Rng, type WeightedPool } from '@dt/shared';

/** 21~5 点用夜间和全天天气，其他时段用白天和全天天气（规格书 12 §12.1） */
export function isNight(hour: number, w: Tuning['world']): boolean {
  return hour >= w.nightFrom || hour <= w.nightTo;
}

/**
 * 天气池：排除只能用钻石召唤的特殊天气（设计文档 裁定 12）。
 * 权重：夜间专属天气用 nightWeatherOdds；其他天气用 probability × dayWeightScale（设计文档 裁定 13）
 */
export function weatherPool(config: GameConfig, night: boolean, w: Tuning['world']): WeightedPool<Weather> {
  const nightOdds = new Map(w.nightWeatherOdds);
  const allowed = night ? [2, 3] : [1, 3];
  const list = [...config.weather.values()]
    .filter((x) => !x.special && allowed.includes(x.daytime))
    .sort((a, b) => a.id - b.id);
  return buildPool(list, (x) => nightOdds.get(x.id) ?? (x.probability ?? 0) * w.dayWeightScale);
}

export function rollWeather(config: GameConfig, hour: number, w: Tuning['world'], rng: Rng): Weather {
  return pickWeighted(weatherPool(config, isNight(hour, w), w), rng);
}

export function rollKrabStreet(w: Tuning['world'], rng: Rng): number {
  return w.krabStreetMin + rng.int(w.krabStreetMax - w.krabStreetMin + 1);
}

export type HammerPick = { mode: 'coin'; type: number } | { mode: 'diamond' };

/**
 * 雷神锤天气池（4E-1 设计文档 裁定 15）：先按时段筛；银币方式按类型（包括该类型的特殊天气），
 * 钻石方式只要特殊天气；排除当前天气。权重和自动轮换相同
 */
export function hammerPool(
  config: GameConfig,
  hour: number,
  w: Tuning['world'],
  pick: HammerPick,
  currentId: number,
): WeightedPool<Weather> {
  const nightOdds = new Map(w.nightWeatherOdds);
  const allowed = isNight(hour, w) ? [2, 3] : [1, 3];
  const list = [...config.weather.values()]
    .filter(
      (x) =>
        allowed.includes(x.daytime) &&
        x.id !== currentId &&
        (pick.mode === 'diamond' ? x.special : x.type === pick.type),
    )
    .sort((a, b) => a.id - b.id);
  return buildPool(list, (x) => nightOdds.get(x.id) ?? (x.probability ?? 0) * w.dayWeightScale);
}
