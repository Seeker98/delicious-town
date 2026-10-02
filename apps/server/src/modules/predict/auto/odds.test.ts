import { describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../../test/config';
import { rollShelf } from '../../market/rules';
import { weatherPool, isNight } from '../../world/rules';
import { clampP, marketRareChance, weatherTypeShares, WEATHER_TYPE_NAMES } from './odds';

const config = testConfig();
const mt = config.tuning.market;
const w = config.tuning.world;

describe('菜场稀有食材概率估算（238-2 设计 §4.3）', () => {
  it('和另一组随机数直接模拟的结果相差在 3% 以内', () => {
    for (const level of [1, 2]) {
      const est = marketRareChance(config, mt, 12, level, 2000, seededRng(1));
      const rng = seededRng(99);
      let hit = 0;
      for (let i = 0; i < 4000; i++)
        if (
          rollShelf(0, 12, config, mt, rng).some((x) => {
            const f = config.requireFood(x.foodsId);
            return f.level === level && f.odds < 100;
          })
        )
          hit++;
      expect(Math.abs(est - hit / 4000)).toBeLessThan(0.03);
    }
  });
});

describe('天气类型占比（238-2 设计 §4.4）', () => {
  it('白天、夜间各类占比和为 1，和天气池权重一致', () => {
    for (const hour of [13, 23]) {
      const shares = weatherTypeShares(config, w, hour);
      const sum = [...shares.values()].reduce((s, x) => s + x, 0);
      expect(sum).toBeCloseTo(1, 9);
      const pool = weatherPool(config, isNight(hour, w), w);
      const rain = pool.items.filter((x) => x.type === 2);
      const rainW = rain.reduce(
        (s, x) => s + (pool.prefix[pool.items.indexOf(x)]! - (pool.prefix[pool.items.indexOf(x) - 1] ?? 0)),
        0,
      );
      expect(shares.get(2) ?? 0).toBeCloseTo(rainW / pool.total, 9);
    }
    expect(WEATHER_TYPE_NAMES[2]).toBe('雨');
  });

  it('概率夹在 5%~95%', () => {
    expect(clampP(0.01)).toBe(0.05);
    expect(clampP(0.99)).toBe(0.95);
    expect(clampP(0.4)).toBe(0.4);
  });
});
