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

describe('特色菜索引（子项目 4A）', () => {
  it('鉴定道具和教师证按道具 id 索引', () => {
    expect(config.appraiseTools.get(165)).toEqual({ min: 3, max: 5, rate: 1, num: 2 });
    expect(config.appraiseTools.get(163)).toEqual({ min: 1, max: 6, rate: 0.28, num: 1 });
    expect(config.appraiseTools.has(162)).toBe(false);
    expect(config.teacherCerts.get(394)).toEqual({
      levels: [6],
      needStrength: 100,
      maxNum: 5,
      lessonHour: 32,
    });
    expect([...config.teacherCerts.keys()].sort((a, b) => a - b)).toEqual([177, 178, 179, 394]);
    expect(config.requireMc(1).name).toBe('秘·仿膳饽饽');
    expect(() => config.requireMc(99999)).toThrow();
    expect(config.mcProficiency[2]!.name).toBe('熟练');
  });
});

describe('神殿索引（子项目 4B-1）', () => {
  it('飞弹、探险图按道具 id 索引；种子池', () => {
    expect(config.missiles.get(17)).toEqual({ attack: [5000, 5000], hitRate: 0.96, crit: 0.2, critRate: 2 });
    expect([...config.missiles.keys()].sort((a, b) => a - b)).toEqual([17, 18, 19]);
    expect(config.maps.get(171)).toMatchObject({ rate: 0.9, level: [4, 5], num: [10, 20], needStrength: 5 });
    expect([...config.maps.keys()].sort((a, b) => a - b)).toEqual([170, 171, 172, 396]);
    expect(config.seeds.get(1)!.foodsId).toBe(101);
    expect(config.seedPool.items).toHaveLength(96);
    expect(config.tuning.temple.guardianHpBase).toBe(10000);
  });
});

describe('菜园索引（子项目 4B-2）', () => {
  it('配方池、种子兑换按种子 id、肥料分钟数、动作收益', () => {
    expect(config.formulas.get(2)!.resFoodsId).toBe(448);
    expect(config.formulaPool.items).toHaveLength(56);
    expect(config.seedExchange.get(1)).toEqual({ seedId: 1, seedNum: 5, essence: 2 });
    expect([...config.fertilizers]).toEqual([
      [427, 20],
      [428, 60],
    ]);
    expect(config.incomeAction(51)).toMatchObject({ coin: 1, exp: 1, landExp: 5 });
    expect(() => config.incomeAction(999)).toThrow();
    expect(config.tuning.yard.maxLands).toBe(9);
    expect(config.tuning.yard.events.minutes).toEqual([7, 27, 47]);
  });
});

describe('2026-09-30 抓取的数据（问题记录）', () => {
  it('新勋章 PSP；老K、阿黄银币加成 20%', () => {
    expect(config.requireGoods(627)).toMatchObject({
      name: 'PSP',
      type: 9,
      effects: { spRate: 0.01, luckValue: 2 },
    });
    expect(config.requireGoods(621).effects.coinRate).toBe(0.2);
    expect(config.requireGoods(550).effects.coinRate).toBe(0.2);
  });

  it('夜间天气：新增夜间多星、血月；夜间天气都有说明；夜间专属权重按实际刷新概率换算', () => {
    expect(config.weather.get(31)).toMatchObject({ name: '夜间多星', daytime: 2, special: false });
    expect(config.weather.get(31)!.effects).toMatchObject({
      starMCBookRate: 0.05,
      missileCrit: 0.15,
      spRate: 0.2,
    });
    expect(config.weather.get(32)!.effects).toMatchObject({
      roachRate: 1,
      mysteriousRate: 0.015,
      atRate: -0.5,
    });
    for (const id of [28, 29, 30, 31, 32]) expect(config.weather.get(id)!.note).not.toBe('');
    expect(config.tuning.world.nightWeatherOdds).toEqual([
      [28, 14.35],
      [29, 9.56],
      [30, 4.79],
      [31, 0.36],
      [32, 0.24],
    ]);
  });
});
