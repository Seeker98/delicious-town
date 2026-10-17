import { describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { testConfig } from '../../../../test/config';
import { rollShelf } from '../../market/rules';
import { chainTypeShares, clampP, marketRareChance, WEATHER_TYPE_NAMES } from './odds';
import { chainRow, typeShares } from '../../world/chain';

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
            if (x.newbie) return false;
            const f = config.requireFood(x.foodsId);
            return f.level === level && f.odds < 100;
          })
        )
          hit++;
      expect(Math.abs(est - hit / 4000)).toBeLessThan(0.03);
    }
  });

  it('新手格不算（用户 2026-10-17）：只有新手格时概率是 0', () => {
    const only = { ...mt, dailyKinds: 0, dailyKindsLast: 0 };
    expect(config.newbieFoodPool.items.some((f) => f.level === 2 && f.odds < 100)).toBe(true);
    expect(rollShelf(0, 12, config, only, seededRng(1))).toHaveLength(mt.dailyNewbieKinds);
    expect(marketRareChance(config, only, 12, 2, 200, seededRng(1))).toBe(0);
  });
});

describe('天气类型占比（天气改版设计 §1.8：从当前自然天气沿链推）', () => {
  const chain = config.bundle.weatherChain;
  const sunny = [...config.weather.values()].find((x) => x.name === '晴')!.id;
  it('下一次换天：等于当前那一行按大类加总；晴天下一轮没有雪冰；各类加起来是 1', () => {
    const now = gameTime('2026-11-03', 12, 10);
    const next = gameTime('2026-11-03', 13);
    const shares = chainTypeShares(config, w, sunny, now, next);
    const want = typeShares(chainRow(chain, config.weather, sunny, false), config.weather);
    for (const t of [1, 2, 3, 4] as const) expect(shares.get(t) ?? 0).toBeCloseTo(want[t], 9);
    expect(shares.get(3) ?? 0).toBe(0);
    expect([...shares.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
  });
  it('往后推几轮：晴天两轮之后才可能下雪；概率和仍是 1', () => {
    const shares = chainTypeShares(config, w, sunny, gameTime('2026-11-03', 6), gameTime('2026-11-03', 17));
    expect(shares.get(3) ?? 0).toBeGreaterThan(0);
    expect([...shares.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
    expect(WEATHER_TYPE_NAMES[2]).toBe('雨');
  });
  it('概率夹在 5%~95%', () => {
    expect(clampP(0.01)).toBe(0.05);
    expect(clampP(0.99)).toBe(0.95);
    expect(clampP(0.4)).toBe(0.4);
  });
});
