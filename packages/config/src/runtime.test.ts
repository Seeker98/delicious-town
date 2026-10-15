import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { createGameConfig, goodsEffectHours } from './runtime';
import { defaultDataDir, readSourceDir } from './source';
import { FOODS, GOODS } from './ids';
import { cid, fid, gid } from './testItems';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

describe('GameConfig', () => {
  it('按 id 索引', () => {
    expect(config.foods.get(fid('大米'))!.level).toBe(1);
    expect(config.requireStreet(0).name).toBe('新手街');
    expect(config.cookbookIndex.slots).toBeGreaterThanOrEqual(config.bundle.cookbooks.length);
  });

  it('require* 找不到时抛错', () => {
    expect(() => config.requireGoods(999999)).toThrow('unknown goods 999999');
  });

  it('道具有效期：invalidhour 优先，其次 value.time', () => {
    expect(goodsEffectHours(config.requireGoods(gid('开张大吉')))).toBe(360);
    expect(goodsEffectHours(config.requireGoods(gid('新手街')))).toBeNull();
  });
});
describe('2A 运行时索引', () => {
  const cfg = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

  it('食材按等级分组，稀有池只含 odds<100', () => {
    expect(cfg.foodsByLevel.get(1)!.length).toBe(27);
    expect(cfg.foodPools.get(2)!.items.length).toBe(89); // 81 + 新街道 8 种 2 级食材（问题记录 284）
    expect(cfg.rareFoodPools.get(2)!.items.every((f) => f.odds < 100)).toBe(true);
    expect(cfg.masterFoodPool.items.map((f) => f.id)).toEqual(
      [1, 2, 3, 4, 5].map((lv) => FOODS.masterBase + lv),
    );
    expect(cfg.hotFoodPool.items.length).toBe(25); // 18 + 新街道 7 种用量多的稀有食材（问题记录 284）
  });

  it('新手街缺料池（问题记录 378 N3）：新手街菜谱 1 品级要的 2 级食材，按要它的菜数加权；3 级以上不放（审查：会进日常货架冲掉特价、高级货架）', () => {
    const pool = cfg.newbieFoodPool;
    const newbie = cfg.bundle.cookbooks.filter((c) => c.streetId === cfg.bundle.restaurantDefaults.streetId);
    const want = new Map<number, number>();
    for (const c of newbie)
      for (const n of c.needFoods['1'] ?? []) want.set(n.foodsId, (want.get(n.foodsId) ?? 0) + 1);
    const expected = [...want].filter(([id]) => cfg.requireFood(id).level === 2);
    expect(pool.items.map((f) => f.id).sort((a, b) => a - b)).toEqual(
      expected.map(([id]) => id).sort((a, b) => a - b),
    );
    const shisanxiang = cfg.bundle.foods.find((f) => f.name === '十三香')!;
    expect(pool.total).toBe(expected.reduce((s, [, n]) => s + n, 0));
    expect(want.get(shisanxiang.id)).toBe(Math.max(...expected.map(([, n]) => n)));
  });

  it('食谱索引', () => {
    const idx = cfg.cookbookIndex;
    expect(idx.street[cid('南煎丸子')]).toBe(6);
    expect(idx.coin[cid('南煎丸子')]).toBe(cfg.cookbooks.get(cid('南煎丸子'))!.coin);
    expect(idx.idsByStreet.get(0)!.length).toBe(69);
    expect(idx.allIds.length).toBe(3810);
  });

  it('街道勋章 = 60000 + 街道编号（重新编号）', () => {
    for (const s of [0, 11, 20, 29]) expect(cfg.streetMedalId(s)).toBe(60000 + s);
    expect(cfg.isStreetMedal(cfg.requireGoods(gid('北京街')))).toBe(true);
    expect(cfg.isStreetMedal(cfg.requireGoods(GOODS.redPants))).toBe(false);
    // 雕像的 devicetype 也是 20，不是印度街勋章（问题记录 284）
    expect(cfg.isStreetMedal(cfg.requireGoods(gid('史前怪石-雕像')))).toBe(false);
    expect(cfg.isStreetMedal(cfg.requireGoods(gid('印度街')))).toBe(true);
  });

  it('设施位、星级、油壶、品级、活跃项', () => {
    expect(cfg.devices.get(7)!.deviceType).toBe(6);
    expect(cfg.starNeed.get(1)!.needLevel).toBe(13);
    expect(cfg.starAward.get(1)!.goods).toEqual([{ id: gid('升星礼包(一星)'), num: 1 }]);
    expect(cfg.oilNeed.get(1)!.oilMax).toBe(1500);
    expect(cfg.grade(7).spCoinAddRate).toBe(1.3);
    expect(cfg.activationByName.get('签到')!.points).toBe(10);
    expect(cfg.guessFoodIds.has(fid('白菜'))).toBe(true);
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
    expect(config.appraiseTools.get(gid('蟹黄堡秘方'))).toEqual({ min: 3, max: 5, rate: 1, num: 2 });
    // 问题记录 415：美味印章成功率 28% → 40%；厨神玉玺进银币商店，30 万
    expect(config.appraiseTools.get(gid('美味印章'))).toEqual({ min: 1, max: 6, rate: 0.4, num: 1 });
    expect(config.requireGoods(gid('厨神玉玺'))).toMatchObject({ onSale: true, coin: 300000 });
    expect(config.appraiseTools.has(gid('神秘食谱'))).toBe(false);
    expect(config.teacherCerts.get(gid('顶级教师证'))).toEqual({
      levels: [6],
      needStrength: 100,
      maxNum: 5,
      lessonHour: 32,
    });
    expect([...config.teacherCerts.keys()].sort((a, b) => a - b)).toEqual(
      ['初级教师证', '中级教师证', '高级教师证', '顶级教师证'].map(gid),
    );
    expect(config.requireMc(1).name).toBe('秘·仿膳饽饽');
    expect(() => config.requireMc(99999)).toThrow();
    expect(config.mcProficiency[2]!.name).toBe('熟练');
  });
});

describe('神殿索引（子项目 4B-1）', () => {
  it('飞弹、探险图按道具 id 索引', () => {
    expect(config.missiles.get(gid('集束飞弹'))).toEqual({
      attack: [3200, 3200],
      hitRate: 0.96,
      crit: 0.2,
      critRate: 2,
    });
    expect([...config.missiles.keys()].sort((a, b) => a - b)).toEqual(
      ['集束飞弹', '普通飞弹', '爆裂飞弹'].map(gid),
    );
    expect(config.maps.get(gid('高级探险图'))).toMatchObject({
      rate: 0.9,
      level: [4, 5],
      num: [10, 20],
      needStrength: 5,
    });
    expect([...config.maps.keys()].sort((a, b) => a - b)).toEqual(
      ['探险图', '高级探险图', '顶级探险图', '极品探险图'].map(gid),
    );
    expect(config.tuning.temple.guardianHpBase).toBe(20000);
  });
});

describe('2026-09-30 抓取的数据（问题记录）', () => {
  it('新勋章 PSP；老K、阿黄银币加成 20%', () => {
    expect(config.requireGoods(gid('PSP'))).toMatchObject({
      name: 'PSP',
      type: 9,
      effects: { spRate: 0.01, luckValue: 2 },
    });
    expect(config.requireGoods(gid('老K')).effects.coinRate).toBe(0.2);
    expect(config.requireGoods(gid('阿黄')).effects.coinRate).toBe(0.2);
  });

  it('夜间天气：新增夜间多星、血月；夜间天气都有说明；夜间专属权重按实际刷新概率换算', () => {
    expect(config.weather.get(31)).toMatchObject({ name: '夜间多星', daytime: 2, special: false });
    expect(config.weather.get(31)!.effects).toMatchObject({
      starMCBookRate: 0.05,
      missileCrit: 0.15,
      // 天气加算修正 2026-10-16：挑剔 +20% → +10%、血月上座 -50% → -15%
      spRate: 0.1,
    });
    expect(config.weather.get(32)!.effects).toMatchObject({
      roachRate: 1,
      mysteriousRate: 0.015,
      atRate: -0.15,
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

describe('酒吧索引（子项目 4C-1）', () => {
  it('老虎机奖池按 odds 抽、按 id 索引；tuning.bar', () => {
    expect(config.slotPool.total).toBe(19553);
    expect(config.slotPool.items).toHaveLength(22);
    expect(config.slotAwards.get(100)).toMatchObject({ kind: 'goods', itemId: gid('蟹黄堡'), rare: true });
    expect(config.tuning.bar).toMatchObject({
      fgWinRate: 0.25,
      numCost: 8,
      numMax: 25,
      krabCoinTickets: 100,
      slotCells: 3,
      slotFloorSpins: 100,
      slotFloorAwardId: 100,
      awardRates: { foods: 0.25, goods: 0.15, coin: 0.3, exp: 0.3 },
    });
  });
});

describe('厨塔索引（子项目 4C-2）', () => {
  it('守塔人按层索引；tuning.tower', () => {
    expect(config.towerFloors.get(1)).toMatchObject({ name: '见习模范餐厅', minLevel: 1, power: 39 });
    expect(config.towerFloors.get(11)).toBeUndefined();
    expect(config.tuning.tower).toMatchObject({
      dailyBase: 5,
      nightFloor: 3,
      openHour: 6,
      rankSize: 15,
      duelPerFriend: 10,
      sparMaxAt: 50,
      rankGifts: [
        [1, gid('赛厨第1名礼包')],
        [2, gid('赛厨第2名礼包')],
        [3, gid('赛厨第3名礼包')],
        [8, gid('赛厨第4-8名礼包')],
        [15, gid('赛厨第9-15名礼包')],
      ],
    });
  });
});

describe('外卖数值（子项目 4D）', () => {
  it('tuning.takeaway', () => {
    expect(config.tuning.takeaway).toMatchObject({
      openStar: 2,
      openRenown: 888,
      // 道具价格迁移（2026-10-15）：888 万 + 300 钻 → 588 万 + 100 钻
      openCoin: 5_880_000,
      openDiamond: 100,
      refreshNum: 15,
      refreshCoin: 1_000_000,
      refreshRenown: 160,
      gradeRates: [0.4, 0.25, 0.15, 0.1, 0.05, 0.035, 0.015],
      customer: { base: 0.015, luckDiv: 50, success: gid('珊迪'), fail: gid('派大星') },
      rider: { maxLevel: 50, capLevels: [2, 5, 8], oddsBase: 800, oddsMax: 950 },
      awards: [
        [gid('神秘礼券'), 56, 0],
        [gid('探险图'), 30, 0.2],
        [gid('蟹币'), 8, 0.5],
        [gid('高级探险图'), 6, 0.5],
        [gid('顶级探险图'), 2, 0.8],
        [gid('美味券'), 1, 1],
      ],
    });
  });
});

describe('守护兽数值（试玩修复 14，问题记录：守护兽太脆）', () => {
  it('集束飞弹伤害按 tuning 覆盖成 3200（用户 2026-10-07 定：略低于 36 个普通飞弹）；普通、爆裂不变', () => {
    expect(config.missiles.get(gid('集束飞弹'))!.attack).toEqual([3200, 3200]);
    expect(config.missiles.get(gid('普通飞弹'))!.attack).toEqual([90, 110]);
    expect(config.missiles.get(gid('爆裂飞弹'))!.attack).toEqual([80, 130]);
  });
  it('普通飞弹 3750 银币（道具价格迁移 2026-10-15 定稿；原 2400）；集束飞弹标价 10 万；击败奖励以 3 万血为 1 倍', () => {
    expect(config.requireGoods(gid('普通飞弹')).coin).toBe(3750);
    expect(config.requireGoods(gid('集束飞弹')).coin).toBe(100000);
    expect(config.tuning.temple.guardianRewardHp).toBe(30000);
  });
  it('血量 2 万 + 1 万 × 星级', () => {
    expect(config.tuning.temple.guardianHpBase).toBe(20000);
    expect(config.tuning.temple.guardianHpPerStar).toBe(10000);
  });
});

describe('下架的食材（问题记录 367）', () => {
  it('退出各等级的食材池（菜场、合成、神殿、礼包都从这里抽），定义还在', () => {
    const src = readSourceDir(defaultDataDir());
    const b = buildBundle(src).bundle!;
    const f = b.foods.find((x) => x.level === 3 && x.odds < 100)!;
    const c = createGameConfig({
      ...b,
      foods: b.foods.map((x) => (x.id === f.id ? { ...x, retired: true } : x)),
    });
    expect(c.foods.get(f.id)).toBeDefined();
    expect(c.foodsByLevel.get(3)!.some((x) => x.id === f.id)).toBe(false);
    expect(c.foodPools.get(3)!.items.some((x) => x.id === f.id)).toBe(false);
    expect(c.rareFoodPools.get(3)!.items.some((x) => x.id === f.id)).toBe(false);
    expect(c.hotFoodPool.items.some((x) => x.id === f.id)).toBe(false);
  });
});

describe('菜谱存储位（重新编号 PR 3）', () => {
  it('编号 ↔ 存储位双向对得上；字节串长度 = 最大存储位 + 1', () => {
    const b = buildBundle(readSourceDir(defaultDataDir())).bundle!;
    const c = createGameConfig(b);
    for (const cb of b.cookbooks) {
      expect(c.cookbookIndex.slotOf[cb.id]).toBe(cb.slot);
      expect(c.cookbookIndex.idAt[cb.slot]).toBe(cb.id);
    }
    expect(c.cookbookIndex.slots).toBe(Math.max(...b.cookbooks.map((x) => x.slot)) + 1);
  });
  it('存储位和编号不同时照样对得上', () => {
    const b = buildBundle(readSourceDir(defaultDataDir())).bundle!;
    const n = b.cookbooks.length;
    const c = createGameConfig({ ...b, cookbooks: b.cookbooks.map((x, i) => ({ ...x, slot: n - 1 - i })) });
    expect(c.cookbookIndex.slots).toBe(n);
    expect(c.cookbookIndex.idAt[n - 1]).toBe(b.cookbooks[0]!.id);
    expect(c.cookbookIndex.slotOf[b.cookbooks[0]!.id]).toBe(n - 1);
  });
});

describe('旧编号（重新编号 PR 4）', () => {
  it('legacy 是旧编号 → 新编号的查找表', () => {
    const c = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);
    expect(c.legacy.goods.get(1)).toBe(GOODS.mysteryTicket);
    expect(c.legacy.goods.get(GOODS.mysteryTicket)).toBeUndefined();
  });
});

describe('道具价格迁移（2026-10-15）的非商店配置', () => {
  it('探险图每次 5 体力；探险向导工资 1 张探险图 + 5 个万能礼包；理财顾问工资 3 个五级补给包；探险向导证神秘食材 +1%', () => {
    expect(config.requireGoods(gid('探险图')).value).toMatchObject({ needStrength: 5 });
    expect(config.requireGoods(gid('探险向导的工资')).value).toEqual([
      { type: 'goods', id: gid('探险图'), num: 1, rate: 1 },
      { type: 'goods', id: gid('随机万能食材礼包'), num: 5, rate: 1 },
    ]);
    expect(config.requireGoods(gid('银行理财顾问的工资')).value).toMatchObject([{ num: 3 }]);
    expect(config.requireGoods(gid('探险向导')).value).toMatchObject({ mysteriousRate: 0.01 });
    expect(config.requireGoods(gid('探险向导')).desc).toContain('+1%');
  });

  it('每天限购晴雨签、小体力卡、体力卡各 1；每周限购强化石 2', () => {
    expect(config.tuning.shop.dailyLimit).toEqual([
      [gid('晴雨签'), 1],
      [gid('小体力卡'), 1],
      [gid('体力卡'), 1],
    ]);
    expect(config.tuning.shop.weeklyLimit).toEqual([[gid('强化石'), 2]]);
  });
});
