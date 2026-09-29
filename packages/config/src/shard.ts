import { z } from 'zod';
import { restaurantDefaultsSchema } from './raw';
import type { GameConfig } from './runtime';
import type { RestaurantDefaults } from './types';

export interface ShardSettings {
  /** 功能开关：未列出的功能默认开启 */
  features: Record<string, boolean>;
  restaurant: RestaurantDefaults;
}

const shardSettingsSchema = z.object({
  features: z.record(z.string(), z.boolean()),
  restaurant: restaurantDefaultsSchema,
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base[k], v);
  return out;
}

/** 基础配置 + 区服覆盖（深合并，数组整体替换），结果再校验一遍 */
export function resolveShardSettings(config: GameConfig, override: unknown): ShardSettings {
  const base: ShardSettings = { features: {}, restaurant: config.bundle.restaurantDefaults };
  return shardSettingsSchema.parse(deepMerge(base, isPlainObject(override) ? override : {}));
}

export function isFeatureEnabled(settings: ShardSettings, name: string): boolean {
  return settings.features[name] !== false;
}
