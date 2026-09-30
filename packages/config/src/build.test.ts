import { describe, expect, it } from 'vitest';
import { buildBundle, featureOfKey } from './build';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('buildBundle（真实数据）', () => {
  it('没有错误，数量正确', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.foods).toHaveLength(313);
    expect(bundle!.goods).toHaveLength(602);
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

  it('厨具和宝石解析出定义，套装 7 套，引用都有效', () => {
    const { bundle } = buildBundle(source());
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    expect(goods.get(30)!.equip).toMatchObject({ part: 1, essence: 1, total: null, suitId: 0 });
    expect(goods.get(56)!.equip).toMatchObject({ part: 3, total: 25, suitId: 5 });
    expect(goods.get(41)!.gem).toMatchObject({ level: 1, nextId: 274 });
    expect(goods.get(341)!.gem).toMatchObject({ level: 6, nextId: null });
    expect(goods.get(13)!.equip).toBeNull();
    expect(bundle!.goods.filter((g) => g.type === 4).every((g) => g.equip !== null)).toBe(true);
    expect(bundle!.goods.filter((g) => g.type === 5).every((g) => g.gem !== null)).toBe(true);
    expect(bundle!.suits.map((s) => s.id).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 80, 81, 100]);
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
