import { describe, expect, it } from 'vitest';
import { buildBundle, featureOfKey } from './build';
import { SPONSOR_HATS } from './ids';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('buildBundle（真实数据）', () => {
  it('没有错误，数量正确', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.foods).toHaveLength(313);
    expect(bundle!.goods).toHaveLength(617);
    expect(bundle!.cookbooks).toHaveLength(2363);
    expect(bundle!.streets).toHaveLength(14);
    expect(bundle!.starNeed).toHaveLength(12);
    expect(bundle!.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('特色菜：食材只留 id（"[4]海参"的 4 是等级，设计文档 裁定 1）；熟练度表 10 级', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.mysteriousCookbooks).toHaveLength(277);
    const m1 = bundle!.mysteriousCookbooks.find((m) => m.id === 1)!;
    expect(m1.foods).toEqual([390, 412, 261]);
    expect(m1.appraisable).toBe(true);
    expect(bundle!.mysteriousCookbooks.filter((m) => !m.appraisable)).toHaveLength(27);
    expect(bundle!.mcProficiency).toHaveLength(10);
    expect(bundle!.mcProficiency[0]).toEqual({ curlevel: 1, name: '初学', expNext: 200 });
    expect(bundle!.mcProficiency[9]).toEqual({ curlevel: 10, name: '化境', expNext: null });
  });

  it('种子是正式字段（96 种）：食材、等级、各阶段分钟数、产量、权重', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.seeds).toHaveLength(96);
    expect(bundle!.seeds.find((s) => s.id === 1)).toEqual({
      id: 1,
      foodsId: 101,
      name: '大米种子',
      level: 1,
      coin: 1800,
      infancy: 24,
      maturity: 36,
      autumn: 60,
      harvest: 1440,
      harvestNum: 20,
      odds: 70,
    });
    expect('seeds' in bundle!.extra).toBe(false);
  });

  it('合并了新设计的售价和 awardflag', () => {
    const { bundle } = buildBundle(source());
    const cb = bundle!.cookbooks.find((c) => c.id === 1)!;
    expect(cb.coin).toBeGreaterThan(0);
    expect(Object.keys(cb.needFoods)).toHaveLength(10);
    expect(bundle!.goods.find((g) => g.id === 491)!.awardFlag).toBe(6);
  });

  it('解析道具 value：效果、礼包、纯数字', () => {
    const { bundle } = buildBundle(source());
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    expect(goods.get(81)!.effects).toEqual({ atRate: 0.25, coinRate: 1, expRate: 1 });
    expect(goods.get(115)!.gift!.length).toBeGreaterThan(0);
    expect(goods.get(3)!.value).toBe(1);
  });

  it('厨具和宝石解析出定义，套装 9 套，引用都有效', () => {
    const { bundle } = buildBundle(source());
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    expect(goods.get(30)!.equip).toMatchObject({ part: 1, essence: 1, total: null, suitId: 0 });
    expect(goods.get(56)!.equip).toMatchObject({ part: 3, total: 36, suitId: 5 });
    expect(goods.get(41)!.gem).toMatchObject({ level: 1, nextId: 274 });
    expect(goods.get(341)!.gem).toMatchObject({ level: 6, nextId: null });
    expect(goods.get(13)!.equip).toBeNull();
    expect(bundle!.goods.filter((g) => g.type === 4).every((g) => g.equip !== null)).toBe(true);
    expect(bundle!.goods.filter((g) => g.type === 5).every((g) => g.gem !== null)).toBe(true);
    expect(bundle!.suits.map((s) => s.id).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 80, 81, 82, 100]);
  });

  it('同样的输入生成同样的版本号', () => {
    expect(buildBundle(source()).bundle!.version).toBe(buildBundle(source()).bundle!.version);
  });
  it('配方、种子兑换、动作收益是正式字段（子项目 4B-2）', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.formulas).toHaveLength(56);
    expect(bundle!.formulas.find((f) => f.id === 1)).toEqual({
      id: 1,
      name: '牡丹籽油配方',
      mainFoodsId: 438,
      subFoodsId: 431,
      addFoodsId: 551,
      resFoodsId: 447,
      odds: 10,
    });
    expect(bundle!.seedExchange).toHaveLength(96);
    expect(bundle!.seedExchange.find((e) => e.seedId === 95)).toEqual({
      seedId: 95,
      seedNum: 1,
      essence: 30,
    });
    expect(bundle!.incomeActions.find((a) => a.id === 54)).toEqual({
      id: 54,
      name: '收获',
      coin: 2,
      exp: 3,
      landExp: 20,
    });
    expect(bundle!.incomeActions.find((a) => a.id === 20)!.landExp).toBe(0);
    expect('formulas' in bundle!.extra).toBe(false);
    expect('seedExchange' in bundle!.extra).toBe(false);
  });

  it('任务 114（鉴定一次食材配方）链接到菜园', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.tasks.find((t) => t.id === 114)!.href).toBe('/yard');
  });
});

describe('buildBundle（坏数据）', () => {
  it('厨具引用了不存在的套装', () => {
    const src = source();
    const goods = structuredClone(src['dataset/goods']) as Array<{ id: number; value: string }>;
    const g = goods.find((x) => x.id === 30)!;
    g.value = g.value.replace('"suitid": 0', '"suitid": 777');
    const { errors } = buildBundle({ ...src, 'dataset/goods': goods });
    expect(errors).toContain('goods 30 references unknown suit 777');
  });

  it('食谱引用了不存在的食材', () => {
    const src = source();
    const cookbooks = structuredClone(src['dataset/cookbooks']) as Array<{
      needFoodsByLevel: Record<string, Array<{ foodsId: number }>>;
    }>;
    cookbooks[0]!.needFoodsByLevel['1']![0]!.foodsId = 999999;
    const { bundle, errors } = buildBundle({ ...src, 'dataset/cookbooks': cookbooks });
    expect(bundle).toBeNull();
    expect(errors).toContain('cookbook 1 grade 1 references unknown food 999999');
  });

  it('礼包引用了不存在的道具', () => {
    const src = source();
    const goods = structuredClone(src['dataset/goods']) as Array<{ id: number; value: string | null }>;
    goods.find((g) => g.id === 117)!.value = '[{"type":"goods","id":888888,"num":1,"rate":1}]';
    const { errors } = buildBundle({ ...src, 'dataset/goods': goods });
    expect(errors).toContain('goods 117 gift references unknown goods 888888');
  });

  it('开店赠送了不存在的道具', () => {
    const src = source();
    const defaults = { ...(src['restaurant_defaults'] as object), giftGoods: [{ id: 777777, num: 1 }] };
    const { errors } = buildBundle({ ...src, restaurant_defaults: defaults });
    expect(errors).toContain('restaurant_defaults gift references unknown goods 777777');
  });

  it('字段类型错误时指出表名和路径', () => {
    const src = source();
    const foods = structuredClone(src['dataset/foods']) as Array<Record<string, unknown>>;
    foods[0]!.coin = 'abc';
    const { errors } = buildBundle({ ...src, 'dataset/foods': foods });
    expect(errors.some((e) => e.startsWith('dataset/foods: 0.coin'))).toBe(true);
  });
});
describe('2A 新增配置', () => {
  it('新表都已规范化', () => {
    const b = buildBundle(source()).bundle!;
    expect(b.cookbookGrades.map((g) => g.grade)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(b.cookbookGrades[6]).toMatchObject({
      name: '佳肴',
      atRatePerCookbook: 0.00011,
      spCoinAddRate: 1.3,
    });
    expect(b.shopSpecialTiers.map((t) => t.discount)).toEqual([0.9, 0.8, 0.7, 0.5, 0.1]);
    expect(b.shopSpecialTiers[0]).toMatchObject({ name: '九折', from: 0, to: 0.5, stock: 50 });
    expect(b.shopPools.special).toContain(21);
    expect(b.shopPools.black).toContain(86);
    expect(b.potTiers.map((t) => t.count)).toEqual([4, 6, 7]);
    expect(b.potTiers[0]!.effects).toEqual({ coinRate: 0.08 });
    expect(b.paintingTiers.map((t) => t.count)).toEqual([7, 10, 13]);
    expect(b.paintingTiers[0]!.effects).toEqual({ autoAddOil: 1, mcCoinAdd: 1 });
    expect(b.marketGuessFoods).toHaveLength(108);
    expect(b.guessAwards.map((a) => a.hits)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(b.guessBonus.map((a) => a.minHits)).toEqual([5, 4]);
    expect(b.tuning.settlement.autoRefuelThreshold).toBe(2000);
    expect(b.tuning.market.shelfLimits).toEqual([1000, 1, 9]);
    expect(b.holidays.lunar['2026-02-17']).toBe('春节');
    expect(b.actionMap.activation['oil.fill']).toBe('给自己添油');
  });

  it('任务按事件键归属到功能', () => {
    const b = buildBundle(source()).bundle!;
    const main = (step: number) => b.tasks.find((t) => t.main && t.step === step)!;
    expect(main(1).feature).toBe('growth'); // oil.fill
    expect(main(3).feature).toBe('cookbook'); // cookbooks.learned
    expect(main(7).feature).toBe('task'); // signin
    expect(main(8).feature).toBe('friend'); // roach.kill
    expect(main(10).feature).toBe('restaurant'); // rest.level
    expect(b.tasks.find((t) => t.cond.key === 'rest.thumbs')!.feature).toBe('friend');
  });

  it('featureOfKey 取最长前缀；找不到返回 null', () => {
    const f = { 'rest.': 'restaurant', 'rest.thumbs': 'friend', signin: 'task' };
    expect(featureOfKey('rest.level', f)).toBe('restaurant');
    expect(featureOfKey('rest.thumbs', f)).toBe('friend');
    expect(featureOfKey('signin', f)).toBe('task');
    expect(featureOfKey('unknown.key', f)).toBeNull();
  });

  it('活跃映射引用了不存在的活跃项', () => {
    const src = source();
    const map = structuredClone(src['game/action_map']) as { activation: Record<string, string> };
    map.activation['oil.fill'] = '不存在的活跃';
    const { errors } = buildBundle({ ...src, 'game/action_map': map });
    expect(errors).toContain('action_map activation oil.fill references unknown activation 不存在的活跃');
  });

  it('任务的事件键找不到功能', () => {
    const src = source();
    const map = structuredClone(src['game/action_map']) as { features: Record<string, string> };
    delete map.features['oil.'];
    const { errors } = buildBundle({ ...src, 'game/action_map': map });
    expect(errors).toContain('task 1 key oil.fill has no feature');
  });

  it('tuning 缺字段时报错', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { rest: Record<string, unknown> };
    delete tuning.rest.atRateBase;
    const { bundle, errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(bundle).toBeNull();
    expect(errors.some((e) => e.startsWith('game/tuning: rest.atRateBase'))).toBe(true);
  });

  it('竞猜奖励引用了不存在的道具', () => {
    const src = source();
    const award = structuredClone(src['game/market_guess_award']) as {
      byHits: Array<{ award: { goods: Array<{ id: number }> } }>;
    };
    award.byHits[0]!.award.goods[0]!.id = 999999;
    const { errors } = buildBundle({ ...src, 'game/market_guess_award': award });
    expect(errors).toContain('market_guess_award hits 1 references unknown goods 999999');
  });
});

describe('酒吧配置（子项目 4C-1）', () => {
  it('老虎机奖池 22 项：空格、食材、道具，稀有和新闻标记', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const s = bundle!.slotAwards;
    expect(s).toHaveLength(22);
    expect(s.reduce((x, a) => x + a.odds, 0)).toBe(19553);
    expect(s.find((a) => a.id === 0)).toEqual({
      id: 0,
      kind: 'empty',
      itemId: null,
      odds: 15000,
      rare: false,
      getNum: 1,
      news: false,
    });
    expect(s.find((a) => a.id === 1)).toMatchObject({ kind: 'foods', itemId: 326, odds: 720 });
    expect(s.find((a) => a.id === 100)).toEqual({
      id: 100,
      kind: 'goods',
      itemId: 180,
      odds: 12,
      rare: true,
      getNum: 1,
      news: true,
    });
    expect(s.filter((a) => a.rare).map((a) => a.id)).toEqual([100]);
    expect(s.filter((a) => a.news).map((a) => a.id)).toEqual([11, 19, 21, 99, 100]);
  });

  it('任务 13、108 链接到 /bar', () => {
    const { bundle } = buildBundle(source());
    for (const id of [13, 108]) expect(bundle!.tasks.find((t) => t.id === id)!.href).toBe('/bar');
  });

  it('老虎机奖项引用了不存在的食材', () => {
    const src = source();
    const awards = structuredClone(src['dataset/bar_slot_machine_award']) as Array<{
      id: number;
      foodsId: number | null;
    }>;
    awards.find((a) => a.id === 1)!.foodsId = 999999;
    const { errors } = buildBundle({ ...src, 'dataset/bar_slot_machine_award': awards });
    expect(errors).toContain('bar_slot_machine_award 1 references unknown food 999999');
  });

  it('保底奖项不在奖池里', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { bar: { slotFloorAwardId: number } };
    tuning.bar.slotFloorAwardId = 555;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.bar.slotFloorAwardId 555 not in slot awards');
  });
});

describe('厨塔配置（子项目 4C-2）', () => {
  it('守塔人 10 层：名字、称号、最低等级、每日次数、是否比拼特色菜；属性按 tower_fix 的厨力校准（问题记录 120）', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const f = bundle!.towerFloors;
    expect(f.map((x) => x.floor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(f.map((x) => x.power)).toEqual([13, 66, 169, 234, 421, 494, 640, 803, 1164, 1522]);
    expect(f[9]).toMatchObject({
      name: '彭祖',
      title: '食神',
      minLevel: 91,
      maxTimes: 2,
      mc: true,
      note: '你会做蛋炒饭吗?',
      attrs: { cook: 350, cutting: 350, fire: 350, season: 194, creatives: 194, luck: 169 },
    });
    expect(f.filter((x) => x.mc).map((x) => x.floor)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(f.map((x) => x.maxTimes)).toEqual([10, 10, 10, 10, 5, 3, 2, 1, 1, 2]);
  });

  it('声望商店是正式字段', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.renownShop).toHaveLength(12);
    expect(bundle!.renownShop[0]).toEqual({
      goodsId: 310,
      renown: 60,
      rare: false,
      weeklyLimit: 10,
      weekGroup: 0,
      require: null,
    });
    expect(bundle!.renownShop.find((x) => x.goodsId === 439)).toMatchObject({
      renown: 5000,
      rare: true,
      weekGroup: 4,
    });
    expect(bundle!.renownShop.find((x) => x.goodsId === 506)).toMatchObject({ require: 'xz' });
    expect('renownShop' in bundle!.extra).toBe(false);
  });

  it('赛厨榜礼包引用了不存在的道具', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { tower: { rankGifts: number[][] } };
    tuning.tower.rankGifts[0]![1] = 999999;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.tower.rankGifts references unknown goods 999999');
  });

  it('赛厨榜挑战计入活跃"与好友赛厨"', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.actionMap.activation['tower.rank']).toBe('与好友赛厨');
  });
});

describe('外卖配置（子项目 4D）', () => {
  it('任务 34、35、122 跳到外卖页', () => {
    const { bundle } = buildBundle(source());
    for (const id of [34, 35, 122]) expect(bundle!.tasks.find((t) => t.id === id)!.href).toBe('/takeaway');
  });

  it('奖池、神秘顾客引用了不存在的道具', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as {
      takeaway: { awards: number[][]; customer: { success: number } };
    };
    tuning.takeaway.awards[1]![0] = 999998;
    tuning.takeaway.customer.success = 999999;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.takeaway.awards references unknown goods 999998');
    expect(errors).toContain('tuning.takeaway.customer references unknown goods 999999');
  });

  it('品级概率合计必须是 1', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { takeaway: { gradeRates: number[] } };
    tuning.takeaway.gradeRates[0] = 0.5;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.takeaway.gradeRates must sum to 1');
  });
});

describe('小镇（子项目 4E-1）', () => {
  it('镇长兑换和星愿类型化', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.goodsExchange).toHaveLength(73);
    expect(bundle!.goodsExchange[1]).toEqual({
      id: 2,
      category: 'bg',
      goodsId: 238,
      num: 1,
      need: [{ goodsId: 180, num: 8 }],
      times: 1,
      news: true,
    });
    expect(bundle!.bless).toHaveLength(12);
    expect(bundle!.bless[0]).toEqual({
      id: 1,
      name: '五谷丰登',
      type: 5,
      num: 3,
      needAct: 60,
      levels: [1, 2],
      goodsId: null,
      buff: { atRate: 0.05 },
      odds: 10,
    });
    expect(bundle!.bless.find((b) => b.id === 6)).toMatchObject({ type: 2, goodsId: 1, levels: null });
    expect('goodsExchange' in bundle!.extra).toBe(false);
    expect('bless' in bundle!.extra).toBe(false);
    expect(bundle!.tuning.town.shake).toMatchObject({ limitIp: false, limitDevice: false });
  });

  it('嘻哈男孩和论坛的事件键不再归到 town（裁定 22）', () => {
    const { bundle } = buildBundle(source());
    const f = bundle!.actionMap.features;
    expect(featureOfKey('hiphop.reward', f)).toBe('hiphop');
    expect(featureOfKey('post.create', f)).toBe('forum');
    expect(featureOfKey('broadcast', f)).toBe('town');
    expect(featureOfKey('krab.shake', f)).toBe('town');
    expect(bundle!.tasks.find((t) => t.id === 102)!.href).toBe('/town');
    expect(bundle!.tasks.find((t) => t.id === 109)!.href).toBe('/town');
  });
});

describe('终审修复（4E-1）', () => {
  it('声望商店引用了不存在的道具时构建报错（M2：误删的校验）', () => {
    const src = source();
    const shop = structuredClone(src['designed/renown_shop']) as Array<{ goodsId: number }>;
    shop[0]!.goodsId = 999_999;
    src['designed/renown_shop'] = shop;
    expect(buildBundle(src).errors).toContain('renown_shop references unknown goods 999999');
  });
});

describe('酒吧扩展（子项目 4C-3）', () => {
  it('三个新游戏的数值', () => {
    const { bundle } = buildBundle(source());
    const bar = bundle!.tuning.bar;
    expect(bar.devil).toEqual({
      stakes: [1, 5, 10, 20],
      cups: 6,
      rate: 1.4,
      hangoverMinutes: 60,
      hangoverAtRate: -0.1,
      newsSurvived: 3,
    });
    expect(bar.memory.lengths).toEqual([3, 5, 7]);
    expect(bar.memory.dailyMax).toBe(20);
    expect(bar.darts.cost).toBe(2);
    // 全中靶心奖励等级降到 6，避免脚本刷满（4C-3 PR 遗留问题，用户确认）
    expect(bar.darts.perfectLevel).toBe(6);
    expect(bar.darts.rings[0]).toEqual([0.05, 50]);
  });
});

describe('嘻哈男孩、排行（子项目 4E-2）', () => {
  it('数值和工作证', () => {
    const { bundle } = buildBundle(source());
    const h = bundle!.tuning.hiphop;
    expect(h.weeklyCards).toEqual([108, 109, 107, 111, 110]);
    expect(new Set(h.wages.map(([card]) => card))).toEqual(new Set(h.weeklyCards));
    expect(h.requireVerifiedEmail).toBe(false);
    expect(bundle!.tuning.market.manualPersonMax).toBe(99);
    expect(bundle!.tuning.rank.top).toBe(50);
  });

  it('地点只能是 1~6 和 9', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { hiphop: { placeWeights: number[][] } };
    tuning.hiphop.placeWeights.push([8, 1]);
    expect(buildBundle({ ...src, 'game/tuning': tuning }).errors).toContain(
      'tuning.hiphop.placeWeights has unknown place 8',
    );
  });

  it('工资表的证要和周榜的证一致', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { hiphop: { wages: number[][] } };
    tuning.hiphop.wages.pop();
    expect(buildBundle({ ...src, 'game/tuning': tuning }).errors).toContain(
      'tuning.hiphop.wages must cover exactly the weeklyCards',
    );
  });
});

describe('论坛（子项目 4E-3）', () => {
  it('数值和发帖支线的跳转', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.tuning.forum).toEqual({
      titleMax: 40,
      contentMax: 5000,
      replyMax: 500,
      queryMax: 20,
      postCooldownSec: 60,
      postDailyMax: 10,
      replyCooldownSec: 60,
      pageSize: 20,
      excerpt: 60,
      readsMax: 200,
      featureReward: { goods: [[1, 20]], diamond: 50 },
    });
    expect(bundle!.tasks.find((t) => t.id === 107)!.href).toBe('/forum');
  });

  it('加精奖励引用了不存在的道具时构建报错', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { forum: { featureReward: { goods: number[][] } } };
    tuning.forum.featureReward.goods = [[999999, 1]];
    expect(buildBundle({ ...src, 'game/tuning': tuning }).errors).toContain(
      'forum.featureReward references unknown goods 999999',
    );
  });
});

describe('厨具改名和新套装（清理 15 · 问题记录）', () => {
  const byId = () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    return {
      goods: new Map(bundle!.goods.map((g) => [g.id, g])),
      suits: new Map(bundle!.suits.map((s) => [s.id, s])),
    };
  };

  it('旧厨具改名，说明里带背景故事', () => {
    const { goods } = byId();
    expect(goods.get(33)!.name).toBe('灵魂之沙利叶的无情之铲');
    expect(goods.get(34)!.name).toBe('灵魂之沙利叶的无情之刃');
    expect(goods.get(56)!.name).toBe('沉默之度玛的静谧之镬');
    expect(goods.get(58)!.name).toBe('沉默之度玛的静谧之冠');
    expect(goods.get(59)!.name).toBe('裁决之巴贝雷特的悲鸣之铲');
    expect(goods.get(61)!.name).toBe('裁决之巴贝雷特的悲鸣之冠');
    expect(goods.get(352)!.name).toBe('神谕之阿卡玛的荣耀之铲');
    expect(goods.get(413)!.name).toBe('神谕之阿卡玛的荣耀之冠');
    // 说明保留原来的属性提示，再加故事
    expect(goods.get(33)!.desc).toMatch(/^厨艺\+21。.+/);
    expect(goods.get(352)!.desc).toMatch(/^厨艺\+51。.+/);
    // 数值按强化数值表（问题记录 120）
    expect(goods.get(59)!.equip).toMatchObject({ part: 1, total: 31, suitId: 6 });
  });

  it('阿卡玛五件从厨塔第 8 层起掉落（原来没有获得途径）', () => {
    const { goods } = byId();
    for (const id of [352, 353, 354, 356, 413]) expect(goods.get(id)!.awardFlag).toBe(8);
  });

  it('新厨具：沙利叶镬瓶、巴贝雷特镬瓶、古尔图格五件、茵蔯四件', () => {
    const { goods } = byId();
    const parts = (ids: number[]) => ids.map((id) => goods.get(id)!.equip!.part);
    expect(goods.get(628)).toMatchObject({ name: '灵魂之沙利叶的无情之镬', awardFlag: 4, type: 4 });
    expect(goods.get(628)!.equip).toMatchObject({ part: 3, suitId: 4, minLevel: 40, total: null });
    expect(goods.get(628)!.equip!.ranges.fire).toBe(21);
    expect(goods.get(629)!.equip!.ranges.season).toBe(21);
    expect(parts([630, 631])).toEqual([3, 4]);
    expect(goods.get(630)!.equip).toMatchObject({ suitId: 6, total: 31 });
    expect(goods.get(630)!.awardFlag).toBe(6);
    expect(goods.get(632)!.name).toBe('意志之古尔图格的精华之铲');
    expect(parts([632, 633, 634, 635, 636])).toEqual([1, 2, 3, 4, 5]);
    for (const id of [632, 636]) {
      expect(goods.get(id)!.equip).toMatchObject({ suitId: 82, total: 41, minLevel: 70 });
      expect(goods.get(id)!.awardFlag).toBe(7);
    }
    expect(goods.get(637)!.name).toBe('堕落之茵蔯的炙热之铲');
    expect(parts([637, 638, 639, 640])).toEqual([1, 2, 3, 4]);
    for (const id of [637, 640]) {
      expect(goods.get(id)!.equip).toMatchObject({ suitId: 7, total: 25, minLevel: 50 });
      expect(goods.get(id)!.awardFlag).toBe(5);
    }
    for (const id of [628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640])
      expect(goods.get(id)!.desc.length).toBeGreaterThan(10);
  });

  it('套装改名，沙利叶 4 件、巴贝雷特 3/4/5 件、茵蔯 2/4 件、古尔图格 4/5 件', () => {
    const { suits } = byId();
    expect([...suits.keys()].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 80, 81, 82, 100]);
    expect(suits.get(4)).toMatchObject({ name: '沙利叶的灵魂', maxNum: 4 });
    expect(suits.get(4)!.tiers.map((t) => t.need)).toEqual([2, 4]);
    expect(suits.get(4)!.tiers[1]!.effects).toEqual({ cookPct: 0.04, seasonPct: 0.04, luckValue: 8 });
    expect(suits.get(5)).toMatchObject({ name: '度玛的沉默', maxNum: 3 });
    expect(suits.get(6)).toMatchObject({ name: '巴贝雷特的裁决', maxNum: 5 });
    expect(suits.get(6)!.tiers.map((t) => t.need)).toEqual([3, 4, 5]);
    expect(suits.get(6)!.tiers[0]!.effects).toEqual({ cookPct: 0.05, seasonPct: 0.06 });
    expect(suits.get(6)!.tiers[1]!.effects).toEqual({ atRate: 0.08, operFoodsAddRate: 0.05 });
    expect(suits.get(6)!.tiers[2]!.effects).toEqual({ cuttingPct: 0.05, firePct: 0.05, luckValue: 16 });
    expect(suits.get(7)).toMatchObject({ name: '茵蔯的堕落', maxNum: 4 });
    expect(suits.get(7)!.tiers.map((t) => t.effects)).toEqual([
      { firePct: 0.05, atRate: 0.03 },
      { cookPct: 0.04, cuttingPct: 0.04, luckValue: 12 },
    ]);
    expect(suits.get(80)).toMatchObject({ name: '阿卡玛的神谕', maxNum: 5 });
    expect(suits.get(82)).toMatchObject({ name: '古尔图格的意志', maxNum: 5 });
    expect(suits.get(82)!.tiers.map((t) => t.effects)).toEqual([
      { cuttingPct: 0.06, firePct: 0.06 },
      { atRate: 0.06, luckValue: 24, attackCook: 0.05 },
    ]);
  });

  it('每套的件数上限等于这套的厨具数', () => {
    const { bundle } = buildBundle(source());
    for (const s of bundle!.suits.filter((x) => [4, 5, 6, 7, 80, 82].includes(x.id)))
      expect(bundle!.goods.filter((g) => g.equip?.suitId === s.id)).toHaveLength(s.maxNum);
  });

  it('改名引用了不存在的道具、新增道具 id 重复时构建报错', () => {
    const src = source();
    const lore = structuredClone(src['game/equip_lore']) as {
      rename: Array<{ id: number }>;
      add: Array<{ id: number }>;
    };
    lore.rename[0]!.id = 999999;
    lore.add[0]!.id = 33;
    const { errors } = buildBundle({ ...src, 'game/equip_lore': lore });
    expect(errors).toContain('equip_lore rename references unknown goods 999999');
    expect(errors).toContain('equip_lore add duplicates goods 33');
  });

  it('overlay 写错键名、套装效果键拼错、档位件数超过上限、件数和上限对不上时构建报错（终审 I3）', () => {
    const src = source();
    type Lore = {
      rename: Array<Record<string, unknown>>;
      suits: Array<{
        suitid: number;
        maxnum: number;
        tiers: Array<{ neednum: number; value: Record<string, number> }>;
      }>;
    };
    const lore = structuredClone(src['game/equip_lore']) as Lore;
    lore.rename[0]!.awardFlag = 8;
    const { errors } = buildBundle({ ...src, 'game/equip_lore': lore });
    expect(errors).toContainEqual(expect.stringMatching(/^game\/equip_lore: rename\.0.*awardFlag/));
    const lore2 = structuredClone(src['game/equip_lore']) as Lore;
    lore2.suits.find((s) => s.suitid === 4)!.tiers[1]!.value = { luckvalue: 8 };
    lore2.suits.find((s) => s.suitid === 7)!.tiers[1]!.neednum = 5;
    lore2.suits.find((s) => s.suitid === 82)!.maxnum = 6;
    const e2 = buildBundle({ ...src, 'game/equip_lore': lore2 }).errors;
    expect(e2).toContain('equip_suits 4 has unknown effect luckvalue');
    expect(e2).toContain('equip_suits 7 tier needs 5 pieces but maxnum is 4');
    expect(e2).toContain('equip_suits 82 has 5 pieces but maxnum is 6');
  });
});

describe('配置校验补强（PR27、PR28 遗留）', () => {
  const tuningWith = (patch: (t: Record<string, any>) => void) => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as Record<string, any>;
    patch(tuning);
    return buildBundle({ ...src, 'game/tuning': tuning }).errors;
  };
  it('记忆调酒：关数和奖励等级数量要一致', () => {
    expect(tuningWith((t) => t.bar.memory.awardLevels.pop())).toContain(
      'tuning.bar.memory: lengths and awardLevels must have the same count',
    );
  });
  it('飞镖：摆动周期小的在前；圈按半径从小到大', () => {
    expect(tuningWith((t) => (t.bar.darts.periodMs = [1400, 900]))).toContain(
      'tuning.bar.darts.periodMs must be [min, max]',
    );
    expect(tuningWith((t) => t.bar.darts.rings.reverse())).toContain(
      'tuning.bar.darts.rings must be sorted by radius',
    );
  });
  it('飞弹伤害覆盖：道具要存在，最小值不大于最大值', () => {
    expect(tuningWith((t) => t.temple.missileAttack.push([999999, 1, 2]))).toContain(
      'tuning.temple.missileAttack references unknown goods 999999',
    );
    expect(tuningWith((t) => t.temple.missileAttack.push([17, 9, 3]))).toContain(
      'tuning.temple.missileAttack 17 min > max',
    );
  });
});

describe('赞助帽子和邮件数值（子项目 6A-1）', () => {
  it('玉级、铉级赞助帽子：冠，创意 22 / 40，不算套装，不掉落，不卖', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    const jade = goods.get(SPONSOR_HATS.jade)!;
    const xuan = goods.get(SPONSOR_HATS.xuan)!;
    expect(jade.name).toBe('玉•赞助之帽');
    expect(xuan.name).toBe('铉•赞助之帽');
    expect(jade.equip).toMatchObject({ part: 5, suitId: 90, minLevel: 13 });
    expect(jade.equip!.ranges.creatives).toBe(25);
    expect(xuan.equip).toMatchObject({ part: 5, suitId: 99 });
    expect(xuan.equip!.ranges.creatives).toBe(41);
    for (const g of [jade, xuan]) {
      expect(g.awardFlag).toBeNull();
      expect(g.onSale).toBe(false);
    }
  });

  it('邮件 30 天过期，列表最多 100 封', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.tuning.mail).toEqual({ expiresDays: 30, listMax: 100 });
  });
});

describe('邀请和兑换码数值（子项目 6A-2）', () => {
  it('邀请：每月 20 人，10 级、30 级两档；兑换：每小时失败 10 次上限，一批最多 1000 个码', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.tuning.invite).toMatchObject({ monthlyCap: 20, levels: { lv10: 10, lv30: 30 } });
    expect(bundle!.tuning.invite.newbie).toEqual({ coin: 50000, goods: [{ id: 1, num: 5 }] });
    expect(bundle!.tuning.redeem).toEqual({ failLimit: 10, failWindowSec: 3600, batchMax: 1000 });
  });

  it('邀请奖励引用了不存在的道具时构建报错', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as {
      invite: { rewards: { lv10: { goods?: unknown } } };
    };
    tuning.invite.rewards.lv10.goods = [{ id: 999999, num: 1 }];
    expect(buildBundle({ ...src, 'game/tuning': tuning }).errors).toContain(
      'invite.rewards.lv10 references unknown goods 999999',
    );
  });
});

describe('守塔人（问题记录 120）', () => {
  it('第 5、6 层互换；厨力按参照玩家重算', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const f = bundle!.towerFloors;
    expect(f[4]).toMatchObject({
      floor: 5,
      name: '裁决之巴贝雷特',
      title: '裁决长老',
      minLevel: 41,
      maxTimes: 5,
    });
    expect(f[5]).toMatchObject({
      floor: 6,
      name: '沉默的度玛',
      title: '育才长老',
      minLevel: 51,
      maxTimes: 3,
    });
    const want = [14, 66, 168, 236, 420, 494, 640, 802, 1162, 1522];
    f.forEach((x, i) => expect(Math.abs(x.power - want[i]!)).toBeLessThanOrEqual(3));
  });

  it('覆盖文件写了不存在的层时报错', () => {
    const src = source();
    expect(buildBundle({ ...src, 'game/tower_fix': { floors: [{ floor: 11, power: 1 }] } }).errors).toContain(
      'tower_fix references unknown floor 11',
    );
  });
});

describe('举报数值（子项目 6B-1）', () => {
  it('每天最多举报 10 次', () => {
    expect(buildBundle(source()).bundle!.tuning.report).toEqual({ dailyMax: 10 });
  });
});
