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

describe('backlog 156-1：交易所参考价覆盖值上限', () => {
  it('不能超过单价上限 1 亿：再大价格下限就超过单价上限，任何挂单都过不了校验', () => {
    expect(() =>
      resolveShardSettings(config, { tuning: { exchange: { refOverrides: { '1': 100_000_001 } } } }),
    ).toThrow();
    expect(
      resolveShardSettings(config, { tuning: { exchange: { refOverrides: { '1': 100_000_000 } } } }).tuning
        .exchange.refOverrides,
    ).toEqual({ '1': 100_000_000 });
  });
});

describe('功能开关默认值（收购 PR 1）', () => {
  it('收购默认关，区服覆盖里写 true 才开；别的功能照旧默认开', () => {
    const base = resolveShardSettings(config, {});
    expect(isFeatureEnabled(base, 'acquire')).toBe(false);
    expect(isFeatureEnabled(base, 'fund')).toBe(true);
    expect(isFeatureEnabled(resolveShardSettings(config, { features: { acquire: true } }), 'acquire')).toBe(
      true,
    );
  });

  it('收购的默认数值', () => {
    expect(config.tuning.acquire).toMatchObject({
      priceDays: 7,
      priceMultiple: 5,
      minPrice: 100000,
      taxRate: 0.1,
      maxHoldings: 10,
      listMinRate: 0.5,
    });
  });
});
