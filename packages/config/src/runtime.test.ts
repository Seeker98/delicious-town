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
describe('2A 运行时索引', () => {
  const cfg = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

  it('食材按等级分组，稀有池只含 odds<100', () => {
    expect(cfg.foodsByLevel.get(1)!.length).toBe(27);
    expect(cfg.foodPools.get(2)!.items.length).toBe(81);
    expect(cfg.rareFoodPools.get(2)!.items.every((f) => f.odds < 100)).toBe(true);
    expect(cfg.masterFoodPool.items.map((f) => f.id)).toEqual([467, 468, 469, 470, 471]);
    expect(cfg.hotFoodPool.items.length).toBe(18);
  });

  it('食谱索引', () => {
    const idx = cfg.cookbookIndex;
    expect(idx.street[1]).toBe(6);
    expect(idx.coin[1]).toBe(cfg.cookbooks.get(1)!.coin);
    expect(idx.idsByStreet.get(0)!.length).toBe(72);
    expect(idx.allIds.length).toBe(2363);
  });

  it('街道勋章：新手街 140，江西街 187', () => {
    expect(cfg.streetMedalId(0)).toBe(140);
    expect(cfg.streetMedalId(11)).toBe(187);
    expect(cfg.isStreetMedal(cfg.requireGoods(189))).toBe(true);
    expect(cfg.isStreetMedal(cfg.requireGoods(100))).toBe(false);
  });

  it('设施位、星级、油壶、品级、活跃项', () => {
    expect(cfg.devices.get(7)!.deviceType).toBe(6);
    expect(cfg.starNeed.get(1)!.needLevel).toBe(13);
    expect(cfg.starAward.get(1)!.goods).toEqual([{ id: 117, num: 1 }]);
    expect(cfg.oilNeed.get(1)!.oilMax).toBe(1500);
    expect(cfg.grade(7).spCoinAddRate).toBe(1.3);
    expect(cfg.activationByName.get('签到')!.points).toBe(10);
    expect(cfg.guessFoodIds.has(238)).toBe(true);
  });

  it('随机奖池不含装备，按 awardflag 过滤', () => {
    const pool = cfg.randomGoodsIds(7);
    expect(pool.length).toBeGreaterThan(0);
    for (const id of pool) {
      const g = cfg.requireGoods(id);
      expect(g.type).not.toBe(4);
      expect(g.awardFlag).not.toBeNull();
      expect(g.awardFlag!).toBeLessThanOrEqual(7);
    }
  });

  it('节日倍数：公历 2、农历 3、同一天两者都有 5、平日 1（按北京时间）', () => {
    expect(cfg.holidayMultiplier(new Date('2026-05-01T04:00:00Z'))).toBe(2);
    expect(cfg.holidayMultiplier(new Date('2026-02-17T04:00:00Z'))).toBe(3);
    expect(cfg.holidayMultiplier(new Date('2031-10-01T04:00:00Z'))).toBe(5); // 国庆 + 中秋
    expect(cfg.holidayMultiplier(new Date('2026-04-05T04:00:00Z'))).toBe(2); // 清明
    expect(cfg.holidayMultiplier(new Date('2026-09-29T04:00:00Z'))).toBe(1);
    // UTC 2026-04-30 16:00 = 北京时间 05-01 00:00
    expect(cfg.holidayMultiplier(new Date('2026-04-30T16:00:00Z'))).toBe(2);
  });
});
