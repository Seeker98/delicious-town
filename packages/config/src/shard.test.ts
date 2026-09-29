import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { createGameConfig } from './runtime';
import { isFeatureEnabled, resolveShardSettings } from './shard';
import { defaultDataDir, readSourceDir } from './source';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

describe('resolveShardSettings', () => {
  it('没有覆盖时用基础配置', () => {
    const s = resolveShardSettings(config, {});
    expect(s.restaurant.coin).toBe(100000);
    expect(isFeatureEnabled(s, 'pond')).toBe(true);
  });

  it('深合并覆盖值', () => {
    const s = resolveShardSettings(config, { features: { pond: false }, restaurant: { coin: 5 } });
    expect(s.restaurant.coin).toBe(5);
    expect(s.restaurant.tableNum).toBe(4);
    expect(isFeatureEnabled(s, 'pond')).toBe(false);
  });

  it('非法覆盖值抛错', () => {
    expect(() => resolveShardSettings(config, { restaurant: { coin: -1 } })).toThrow();
  });
});
describe('区服 tuning 覆盖', () => {
  it('没有覆盖时等于基础 tuning', () => {
    expect(resolveShardSettings(config, {}).tuning).toEqual(config.tuning);
  });
  it('部分覆盖只改指定字段', () => {
    const s = resolveShardSettings(config, { tuning: { market: { specialPrice: 1999 } } });
    expect(s.tuning.market.specialPrice).toBe(1999);
    expect(s.tuning.market.dailyStock).toBe(config.tuning.market.dailyStock);
    expect(s.tuning.rest).toEqual(config.tuning.rest);
  });
  it('覆盖成非法值时报错', () => {
    expect(() => resolveShardSettings(config, { tuning: { rest: { tablesPerFloor: 0 } } })).toThrow();
  });
});
