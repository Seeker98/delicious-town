import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { createGameConfig, goodsEffectHours } from './runtime';
import { defaultDataDir, readSourceDir } from './source';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

describe('GameConfig', () => {
  it('按 id 索引', () => {
    expect(config.foods.get(101)!.name).toBe('大米');
    expect(config.requireStreet(0).name).toBe('新手街');
    expect(config.maxCookbookId).toBeGreaterThanOrEqual(2363);
  });

  it('require* 找不到时抛错', () => {
    expect(() => config.requireGoods(999999)).toThrow('unknown goods 999999');
  });

  it('道具有效期：invalidhour 优先，其次 value.time', () => {
    expect(goodsEffectHours(config.requireGoods(81))).toBe(360);
    expect(goodsEffectHours(config.requireGoods(140))).toBeNull();
  });
});
