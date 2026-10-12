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
