import { z } from 'zod';
import { restaurantDefaultsSchema } from './raw';
import type { GameConfig } from './runtime';
import { tuningSchema, type Tuning } from './tuning';
import type { RestaurantDefaults } from './types';

export interface ShardSettings {
  /** 功能开关：未列出的功能默认开启 */
  features: Record<string, boolean>;
  restaurant: RestaurantDefaults;
  tuning: Tuning;
}

const shardSettingsSchema = z.object({
  features: z.record(z.string(), z.boolean()),
  restaurant: restaurantDefaultsSchema,
  tuning: tuningSchema,
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

/** 默认关的功能：区服覆盖里写 true 才开（新玩法分几个 PR 上线时用；收购 PR 3 起没有） */
export const DEFAULT_OFF_FEATURES: readonly string[] = [];

/** 基础配置 + 区服覆盖（深合并，数组整体替换），结果再校验一遍 */
export function resolveShardSettings(config: GameConfig, override: unknown): ShardSettings {
  const base: ShardSettings = {
    features: Object.fromEntries(DEFAULT_OFF_FEATURES.map((f) => [f, false])),
    restaurant: config.bundle.restaurantDefaults,
    tuning: config.tuning,
  };
  return shardSettingsSchema.parse(deepMerge(base, isPlainObject(override) ? override : {}));
}

export function isFeatureEnabled(settings: Pick<ShardSettings, 'features'>, name: string): boolean {
  return settings.features[name] !== false;
}
