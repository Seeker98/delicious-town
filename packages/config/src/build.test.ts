import { describe, expect, it } from 'vitest';
import { buildBundle, featureOfKey } from './build';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FUND, GOODS, NEWBIE, SPONSOR_HATS, WIKI_HIDDEN_GOODS } from './ids';
import { realBuild } from './testBundle';
import { defaultDataDir, readSourceDir } from './source';
import { cid, fid, gid } from './testItems';

/** 重新编号的对照表（旧编号 → 新编号） */
const RENUMBER_MAP = JSON.parse(readFileSync(join(defaultDataDir(), 'renumber', 'map.json'), 'utf8')) as {
  cookbooks: Array<[number, number]>;
};

const source = () => readSourceDir(defaultDataDir());

describe('Wiki 隐藏道具清单（问题记录 142）', () => {
  it('清单里的道具都存在（改了道具 id 时提醒更新清单）', () => {
    const ids = new Set(realBuild().bundle!.goods.map((g) => g.id));
    for (const id of WIKI_HIDDEN_GOODS) expect(ids.has(id), String(id)).toBe(true);
  });
  it('下架的道具开放接口本来就不显示，不用再列进清单（#143 审查）', () => {
    const retired = new Set(
      realBuild()
        .bundle!.goods.filter((g) => g.retired)
        .map((g) => g.id),
    );
    expect([...WIKI_HIDDEN_GOODS].filter((id) => retired.has(id))).toEqual([]);
  });
});

describe('buildBundle（真实数据）', () => {
  it('没有错误，数量正确', () => {
    const { bundle, errors } = realBuild();
    expect(errors).toEqual([]);
    expect(bundle!.foods).toHaveLength(336); // 313 + 新街道 23 种（问题记录 284）
    expect(bundle!.goods).toHaveLength(721); // 新街道勋章 16 枚（问题记录 284）+ 617 + 纪念品 12 件（148-2）+ 一番赏初代手办 4 件、抽赏券 1 张、月度主题手办 48 件 + 一到五级食材随机券 5 张（问题记录 331）+ 豪华签券 1 张（240-2） + 基金勋章 3 枚（240-2） + 后期海报奖杯 8 个（146）+ 天机石 6 阶（419）
    expect(bundle!.cookbooks).toHaveLength(3810);
    expect(bundle!.streets).toHaveLength(30);
    expect(bundle!.starNeed).toHaveLength(12);
    expect(bundle!.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('老街道修订（问题记录 284）：删 32 道、移街 8 道（176 随杂碎街移过去）', () => {
    const b = realBuild().bundle!;
    const ids = new Set(b.cookbooks.map((c) => c.id));
    // 删掉的菜没有分到新编号（重新编号对照里没有它们的旧编号）
    const renumbered = new Set(RENUMBER_MAP.cookbooks.map(([old]) => old));
    for (const id of [51, 446, 17204, 18441, 18622]) expect(renumbered.has(id), String(id)).toBe(false);
    expect(ids.size).toBe(renumbered.size);
    const street = (id: number) => b.cookbooks.find((c) => c.id === id)!.streetId;
    expect(
      ['开屏武昌鱼', '糍粑鱼', '北京烤鸭', '沔阳三蒸', '兴国米粉鱼', '信丰鸡', '诸候鹅(二)'].map((n) =>
        street(cid(n)),
      ),
    ).toEqual([12, 12, 13, 12, 11, 11, 6]);
    expect(street(cid('左宗棠鸡（美国/加拿大）'))).toBe(29);
    expect(b.cookbooks.find((c) => c.id === cid('左宗棠鸡（美国/加拿大）'))!.name).toBe(
      '左宗棠鸡（美国/加拿大）',
    );
    expect(b.cookbooks.filter((c) => c.streetId === 29)).toHaveLength(117);
    expect(b.cookbooks.find((c) => c.id === cid('开屏武昌鱼'))!.desc).toBe('楚菜，口味辛、咸、鲜');
  });

  it('新街道（问题记录 284）：每道菜 10 个品级、同一品级食材不重复、每条街一枚勋章', () => {
    const b = realBuild().bundle!;
    for (const c of b.cookbooks.filter((x) => x.streetId >= 14))
      for (let g = 1; g <= 10; g++) {
        const ids = c.needFoods[g]!.map((f) => f.foodsId);
        expect(new Set(ids).size, `${c.id} grade ${g}`).toBe(ids.length);
      }
    // 街道勋章 = 60000 + 街道编号（重新编号）
    expect(b.streets.map((s) => s.medalId)).toEqual(b.streets.map((s) => 60000 + s.id));
    // 竞猜清单原本就是日常菜场能出的全部 1、2 级食材：新街道的 1、2 级食材也要能猜
    const guess = new Set(b.marketGuessFoods);
    const daily = new Set(b.tuning.market.dailyLevelWeights.map(([l]) => l));
    expect(b.foods.filter((f) => daily.has(f.level) && !guess.has(f.id)).map((f) => f.id)).toEqual([]);
    expect(guess.has(fid('椰浆'))).toBe(true);
    expect(b.cookbooks.find((c) => c.id === cid('鲷鱼握寿司'))).toMatchObject({
      name: '鲷鱼握寿司',
      streetId: 14,
      coin: 910,
      level: 3,
    });
  });

  it('特色菜：食材只留 id（"[4]海参"的 4 是等级，设计文档 裁定 1）；熟练度表 10 级', () => {
    const { bundle } = realBuild();
    expect(bundle!.mysteriousCookbooks).toHaveLength(277);
    const m1 = bundle!.mysteriousCookbooks.find((m) => m.id === 1)!;
    expect(m1.foods).toEqual([fid('海参'), fid('渤海对虾'), fid('冬笋')]);
    expect(m1.appraisable).toBe(true);
    expect(bundle!.mysteriousCookbooks.filter((m) => !m.appraisable)).toHaveLength(27);
    expect(bundle!.mcProficiency).toHaveLength(10);
    expect(bundle!.mcProficiency[0]).toEqual({ curlevel: 1, name: '初学', expNext: 200 });
    expect(bundle!.mcProficiency[9]).toEqual({ curlevel: 10, name: '化境', expNext: null });
  });

  it('种子是正式字段（96 种）：食材、等级、各阶段分钟数、产量、权重', () => {
    const { bundle } = realBuild();
    expect(bundle!.seeds).toHaveLength(96);
    expect(bundle!.seeds.find((s) => s.id === 1)).toEqual({
      id: 1,
      foodsId: fid('大米'),
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
    const { bundle } = realBuild();
    const cb = bundle!.cookbooks.find((c) => c.id === cid('南煎丸子'))!;
    expect(cb.coin).toBeGreaterThan(0);
    expect(Object.keys(cb.needFoods)).toHaveLength(10);
    expect(bundle!.goods.find((g) => g.id === GOODS.luckyCookie)!.awardFlag).toBe(6);
  });

  it('解析道具 value：效果、礼包、纯数字', () => {
    const { bundle } = realBuild();
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    expect(goods.get(gid('开张大吉'))!.effects).toEqual({ atRate: 0.25, coinRate: 1, expRate: 1 });
    expect(goods.get(GOODS.signInGift)!.gift!.length).toBeGreaterThan(0);
    expect(goods.get(gid('小扩容卡'))!.value).toBe(1);
  });

  it('厨具和宝石解析出定义，套装 9 套，引用都有效', () => {
    const { bundle } = realBuild();
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    expect(goods.get(gid('见习之铲'))!.equip).toMatchObject({ part: 1, essence: 1, total: null, suitId: 0 });
    expect(goods.get(gid('沉默之度玛的静谧之镬'))!.equip).toMatchObject({ part: 3, total: 36, suitId: 5 });
    expect(goods.get(gid('[一阶]•智慧石'))!.gem).toMatchObject({ level: 1, nextId: gid('[二阶]•智慧石') });
    expect(goods.get(gid('[六阶]•智慧石'))!.gem).toMatchObject({ level: 6, nextId: null });
    expect(goods.get(gid('普通宣传海报'))!.equip).toBeNull();
    expect(bundle!.goods.filter((g) => g.type === 4).every((g) => g.equip !== null)).toBe(true);
    expect(bundle!.goods.filter((g) => g.type === 5).every((g) => g.gem !== null)).toBe(true);
    // 宝石的阶就是道具等级（六阶蓝冥石、绿玄石原来写成 5，镶嵌体力、拆卸费按 5 阶算）
    for (const g of bundle!.goods.filter((x) => x.gem)) expect([g.id, g.gem!.level]).toEqual([g.id, g.level]);
    expect(bundle!.suits.map((s) => s.id).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 80, 81, 82, 100]);
  });

  it('天机石 1~6 阶加幸运 1/2/4/8/16/24，升阶链完整，一阶和红晶石一样在特价池、黑市卖（问题记录 419）', () => {
    const { bundle } = realBuild();
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    const tiers = ['一', '二', '三', '四', '五', '六'].map((n) => goods.get(gid(`[${n}阶]•天机石`))!);
    expect(tiers.map((g) => g.gem!.attrs.luck)).toEqual([1, 2, 4, 8, 16, 24]);
    expect(tiers.map((g) => g.gem!.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tiers.map((g) => g.gem!.nextId)).toEqual([...tiers.slice(1).map((g) => g.id), null]);
    for (const g of tiers)
      expect({ ...g.gem!.attrs, luck: 0 }).toEqual({
        cook: 0,
        cutting: 0,
        fire: 0,
        season: 0,
        creatives: 0,
        luck: 0,
      });
    const red = goods.get(gid('[一阶]•红晶石'))!;
    expect([tiers[0]!.coin, tiers[0]!.diamond, tiers[0]!.onSale]).toEqual([
      red.coin,
      red.diamond,
      red.onSale,
    ]);
    expect(bundle!.shopPools.special).toContain(tiers[0]!.id);
    expect(bundle!.shopPools.black).toContain(tiers[0]!.id);
  });

  it('同样的输入生成同样的版本号', () => {
    expect(realBuild().bundle!.version).toBe(buildBundle(source()).bundle!.version);
  });
  it('配方、种子兑换、动作收益是正式字段（子项目 4B-2）', () => {
    const { bundle } = realBuild();
    expect(bundle!.formulas).toHaveLength(56);
    expect(bundle!.formulas.find((f) => f.id === 1)).toEqual({
      id: 1,
      name: '牡丹籽油配方',
      mainFoodsId: fid('槟榔芋'),
      subFoodsId: fid('鱼唇'),
      addFoodsId: fid('乌鸡'),
      resFoodsId: fid('牡丹籽油'),
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

  it('支线「鉴定一次食材配方」链接到菜园', () => {
    const { bundle } = realBuild();
    expect(bundle!.quests.find((q) => q.id === 3142)!.href).toBe('/yard');
  });
});

describe('buildBundle（坏数据）', () => {
  it('厨具引用了不存在的套装', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<{ id: number; value: { suitid: number } }>;
    goods.find((x) => x.id === gid('见习之铲'))!.value.suitid = 777;
    const { errors } = buildBundle({ ...src, 'master/goods': goods });
    expect(errors).toContain(`goods ${gid('见习之铲')} references unknown suit 777`);
  });

  it('食谱引用了不存在的食材', () => {
    const src = source();
    const cookbooks = structuredClone(src['master/cookbooks']) as Array<{
      id: number;
      needFoods: Record<string, Array<{ foodsId: number }>>;
    }>;
    cookbooks[0]!.needFoods['1']![0]!.foodsId = 999999;
    const { bundle, errors } = buildBundle({ ...src, 'master/cookbooks': cookbooks });
    expect(bundle).toBeNull();
    expect(errors).toContain(`cookbook ${cookbooks[0]!.id} grade 1 references unknown food 999999`);
  });

  it('礼包引用了不存在的道具', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<{ id: number; value: unknown }>;
    goods.find((g) => g.id === gid('升星礼包(一星)'))!.value = [
      { type: 'goods', id: 888888, num: 1, rate: 1 },
    ];
    const { errors } = buildBundle({ ...src, 'master/goods': goods });
    expect(errors).toContain(`goods ${gid('升星礼包(一星)')} gift references unknown goods 888888`);
  });

  it('开店赠送了不存在的道具', () => {
    const src = source();
    const defaults = { ...(src['restaurant_defaults'] as object), giftGoods: [{ id: 777777, num: 1 }] };
    const { errors } = buildBundle({ ...src, restaurant_defaults: defaults });
    expect(errors).toContain('restaurant_defaults gift references unknown goods 777777');
  });

  it('街道勋章对应表：街道缺勋章、对应的不是勋章时报错', () => {
    const src = source();
    const map = (src['designed/street_medal_map'] as Array<{ streetId: number; goodsId: number }>).filter(
      (m) => m.streetId !== 20,
    );
    map.push({ streetId: 21, goodsId: GOODS.mysteryTicket });
    const { errors } = buildBundle({ ...src, 'designed/street_medal_map': map });
    expect(errors).toContain('street 20 has no medal');
    expect(errors).toContain(`street_medal_map street 21 goods ${GOODS.mysteryTicket} is not a medal`);
  });

  it('字段类型错误时指出表名和路径', () => {
    const src = source();
    const foods = structuredClone(src['master/foods']) as Array<Record<string, unknown>>;
    foods[0]!.coin = 'abc';
    const { errors } = buildBundle({ ...src, 'master/foods': foods });
    expect(errors.some((e) => e.startsWith('master/foods: 0.coin'))).toBe(true);
  });
});
describe('2A 新增配置', () => {
  it('新表都已规范化', () => {
    const b = realBuild().bundle!;
    expect(b.cookbookGrades.map((g) => g.grade)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(b.cookbookGrades[6]).toMatchObject({
      name: '佳肴',
      atRatePerCookbook: 0.00011,
      spCoinAddRate: 1.3,
    });
    expect(b.shopSpecialTiers.map((t) => t.discount)).toEqual([0.9, 0.8, 0.7, 0.5, 0.1]);
    expect(b.shopSpecialTiers[0]).toMatchObject({ name: '九折', from: 0, to: 0.5, stock: 50 });
    expect(b.shopPools.special).toContain(gid('短效节油器'));
    expect(b.shopPools.black).toContain(gid('升星凭证'));
    expect(b.potTiers.map((t) => t.count)).toEqual([4, 6, 7]);
    expect(b.potTiers[0]!.effects).toEqual({ coinRate: 0.08 });
    expect(b.paintingTiers.map((t) => t.count)).toEqual([7, 10, 13]);
    expect(b.paintingTiers[0]!.effects).toEqual({ autoAddOil: 1, mcCoinAdd: 1 });
    expect(b.marketGuessFoods).toHaveLength(116); // 108 + 新街道 8 种 2 级食材（问题记录 284）
    expect(b.guessAwards.map((a) => a.hits)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(b.guessBonus.map((a) => a.minHits)).toEqual([5, 4]);
    expect(b.tuning.settlement.autoRefuelThreshold).toBe(2000);
    expect(b.tuning.market.shelfLimits).toEqual([1000, 1, 9]);
    expect(b.holidays.lunar['2026-02-17']).toBe('春节');
    expect(b.actionMap.activation['oil.fill']).toBe('给自己添油');
  });

  it('任务按事件键归属到功能', () => {
    const b = realBuild().bundle!;
    const quest = (id: number) => b.quests.find((q) => q.id === id)!;
    expect(quest(2021).feature).toBe('growth'); // oil.fill
    expect(quest(2023).feature).toBe('cookbook'); // cookbooks.learned
    expect(quest(2025).feature).toBe('task'); // signin
    expect(quest(2044).feature).toBe('friend'); // roach.kill
    expect(quest(2026).feature).toBe('restaurant'); // rest.level
    expect(b.quests.find((q) => q.cond.key === 'rest.thumbs')!.feature).toBe('friend');
    // 搬家受 growth 开关控制（backlog 318）：区服关掉 growth 时第 8 章「搬一次家」跳过
    expect(b.quests.find((q) => q.cond.key === 'rest.move')!.feature).toBe('growth');
  });

  it('"全部食谱"的门槛 = 菜谱总数（问题记录 284）', () => {
    const b = realBuild().bundle!;
    expect(b.quests.find((q) => q.id === 3301)!.cond.target).toBe(b.cookbooks.length);
    expect(b.starNeed.find((s) => s.star === 12)!.needCookbooks).toBe(b.cookbooks.length);
  });

  it('门槛写 "all" 时换成菜谱总数；写别的字符串报错', () => {
    const src = source();
    const mains = structuredClone(src['designed/quest_main']) as Array<{
      id: number;
      cond: { target: unknown };
    }>;
    mains.find((x) => x.id === 2023)!.cond.target = 'all';
    const { bundle } = buildBundle({ ...src, 'designed/quest_main': mains });
    expect(bundle!.quests.find((q) => q.id === 2023)!.cond.target).toBe(bundle!.cookbooks.length);
    mains.find((x) => x.id === 2023)!.cond.target = 'most';
    expect(buildBundle({ ...src, 'designed/quest_main': mains }).errors.join()).toMatch(
      /designed\/quest_main/,
    );
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
    expect(errors).toContain('quest 2021 key oil.fill has no feature');
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
    const { bundle, errors } = realBuild();
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
    expect(s.find((a) => a.id === 1)).toMatchObject({ kind: 'foods', itemId: fid('十三香'), odds: 720 });
    expect(s.find((a) => a.id === 100)).toEqual({
      id: 100,
      kind: 'goods',
      itemId: gid('蟹黄堡'),
      odds: 12,
      rare: true,
      getNum: 1,
      news: true,
    });
    expect(s.filter((a) => a.rare).map((a) => a.id)).toEqual([100]);
    expect(s.filter((a) => a.news).map((a) => a.id)).toEqual([11, 19, 21, 99, 100]);
  });

  it('酒吧任务链接到 /bar', () => {
    const { bundle } = realBuild();
    for (const id of [2064, 3081]) expect(bundle!.quests.find((q) => q.id === id)!.href).toBe('/bar');
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
  it('守塔人 10 层：名字、称号、最低等级、每日次数、是否比拼特色菜；属性由长老装备算出（问题记录 408）', () => {
    const { bundle, errors } = realBuild();
    expect(errors).toEqual([]);
    const f = bundle!.towerFloors;
    expect(f.map((x) => x.floor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(f.map((x) => x.power)).toEqual([39, 143, 217, 329, 461, 476, 562, 732, 792, 851]);
    expect(f[9]).toMatchObject({
      name: '彭祖',
      title: '食神',
      minLevel: 91,
      maxTimes: 2,
      mc: true,
      note: '你会做蛋炒饭吗?',
      attrs: { cook: 157, cutting: 275, fire: 62, season: 253, creatives: 35, luck: 138 },
    });
    expect(f[9]!.elder).toMatchObject({ level: 94, stress: 5, drops: [40701, 40702, 40703, 40704, 40705] });
    expect(f.filter((x) => x.mc).map((x) => x.floor)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(f.map((x) => x.maxTimes)).toEqual([10, 10, 10, 10, 5, 3, 2, 1, 1, 2]);
  });

  it('声望商店是正式字段', () => {
    const { bundle } = realBuild();
    expect(bundle!.renownShop).toHaveLength(12);
    expect(bundle!.renownShop[0]).toEqual({
      goodsId: GOODS.dtTicket,
      renown: 60,
      rare: false,
      weeklyLimit: 10,
      weekGroup: 0,
      require: null,
    });
    expect(bundle!.renownShop.find((x) => x.goodsId === GOODS.armStatue)).toMatchObject({
      renown: 5000,
      rare: true,
      weekGroup: 4,
    });
    expect(bundle!.renownShop.find((x) => x.goodsId === gid('仙贝-红'))).toMatchObject({ require: 'xz' });
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
    const { bundle } = realBuild();
    expect(bundle!.actionMap.activation['tower.rank']).toBe('与好友赛厨');
  });
});

describe('外卖配置（子项目 4D）', () => {
  it('外卖任务跳到外卖页', () => {
    const { bundle } = realBuild();
    for (const id of [2141, 2142, 3261])
      expect(bundle!.quests.find((q) => q.id === id)!.href).toBe('/takeaway');
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
    const { bundle, errors } = realBuild();
    expect(errors).toEqual([]);
    expect(bundle!.goodsExchange).toHaveLength(73);
    expect(bundle!.goodsExchange[1]).toEqual({
      id: 2,
      category: 'bg',
      goodsId: gid('龙-十二生肖'),
      num: 1,
      need: [{ goodsId: gid('蟹黄堡'), num: 8 }],
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
    expect(bundle!.bless.find((b) => b.id === 6)).toMatchObject({
      type: 2,
      goodsId: GOODS.mysteryTicket,
      levels: null,
    });
    expect('goodsExchange' in bundle!.extra).toBe(false);
    expect('bless' in bundle!.extra).toBe(false);
    expect(bundle!.tuning.town.shake).toMatchObject({ limitIp: false, limitDevice: false });
  });

  it('嘻哈男孩和论坛的事件键不再归到 town（裁定 22）', () => {
    const { bundle } = realBuild();
    const f = bundle!.actionMap.features;
    expect(featureOfKey('hiphop.reward', f)).toBe('hiphop');
    expect(featureOfKey('post.create', f)).toBe('forum');
    expect(featureOfKey('broadcast', f)).toBe('town');
    expect(featureOfKey('krab.shake', f)).toBe('town');
    expect(bundle!.quests.find((q) => q.id === 3042)!.href).toBe('/town');
    expect(bundle!.quests.find((q) => q.id === 2123)!.href).toBe('/town');
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
    const { bundle } = realBuild();
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

  it('一掷千金的数值（问题记录 427-3）', () => {
    const { bundle } = realBuild();
    const d = bundle!.tuning.bar.deal;
    expect(d).toMatchObject({
      cost: 10000,
      dailyMax: 3,
      opens: [3, 2, 2, 1],
      offerRates: [0.5, 0.65, 0.8, 0.95],
      valueRate: 0.5,
    });
    expect(d.prizes).toHaveLength(10);
    expect(d.prizes[0]).toEqual({ kind: 'food', level: 1, num: 1 });
    expect(d.prizes[9]).toEqual({ kind: 'master', level: 5, num: 5 });
  });

  it('秘制调料的数值（问题记录 427-2）', () => {
    const { bundle } = realBuild();
    expect(bundle!.tuning.bar.spice).toEqual({
      cost: 2,
      dailyMax: 5,
      kinds: 10,
      length: 4,
      tries: 8,
      tiers: [
        { maxTries: 4, awardLevel: 8, renown: 5, news: true },
        { maxTries: 6, awardLevel: 5, renown: 2, news: false },
        { maxTries: 8, awardLevel: 3, renown: 0, news: false },
      ],
    });
  });

  it('最后一颗糖的数值（问题记录 427-1）', () => {
    const { bundle } = realBuild();
    expect(bundle!.tuning.bar.nim).toEqual({
      dailyMax: 10,
      tables: {
        novice: {
          cost: 1,
          k: [3, 3],
          pile: [10, 20],
          mistake: 0.5,
          first: 'choose',
          renown: 1,
          awardLevel: 2,
        },
        expert: { cost: 2, k: [3, 5], pile: [20, 40], mistake: 0, first: 'coin', renown: 3, awardLevel: 5 },
      },
    });
  });
});

describe('嘻哈男孩、排行（子项目 4E-2）', () => {
  it('数值和工作证', () => {
    const { bundle } = realBuild();
    const h = bundle!.tuning.hiphop;
    expect(h.weeklyCards).toEqual(
      ['商店工作证', '改名处工作证', '菜场工作证', '搬家处工作证', '保安证'].map(gid),
    );
    expect(new Set(h.wages.map(([card]) => card))).toEqual(new Set(h.weeklyCards));
    expect(h.requireVerifiedEmail).toBe(false);
    expect(bundle!.tuning.market.manualPersonMax).toBe(99);
    expect(bundle!.tuning.rank.top).toBe(50);
  });

  it('默认权重：原版地点各 10、某家餐厅 7、新地点各 5（问题记录 256）', () => {
    expect(realBuild().bundle!.tuning.hiphop.placeWeights).toEqual([
      [1, 10],
      [2, 10],
      [3, 10],
      [4, 10],
      [5, 10],
      [6, 10],
      [9, 7],
      [10, 5],
      [11, 5],
      [12, 5],
      [13, 5],
      [14, 5],
      [15, 5],
    ]);
  });

  it('地点只能是 1~6、9 和 10~15', () => {
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
    const { bundle } = realBuild();
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
      featureReward: { goods: [[gid('神秘礼券'), 20]], diamond: 50 },
    });
    expect(bundle!.quests.find((q) => q.id === 2124)!.href).toBe('/forum');
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
    const { bundle, errors } = realBuild();
    expect(errors).toEqual([]);
    return {
      goods: new Map(bundle!.goods.map((g) => [g.id, g])),
      suits: new Map(bundle!.suits.map((s) => [s.id, s])),
    };
  };

  it('旧厨具改名，说明里带背景故事', () => {
    const { goods } = byId();
    // 改名的是原有厨具（有重新编号前的旧编号），不是新加的
    const renamed = new Set(realBuild().bundle!.legacy.goods.map(([, id]) => id));
    for (const n of [
      '灵魂之沙利叶的无情之铲',
      '灵魂之沙利叶的无情之刃',
      '沉默之度玛的静谧之镬',
      '沉默之度玛的静谧之冠',
      '裁决之巴贝雷特的悲鸣之铲',
      '裁决之巴贝雷特的悲鸣之冠',
      '神谕之阿卡玛的荣耀之铲',
      '神谕之阿卡玛的荣耀之冠',
    ])
      expect(renamed.has(gid(n)), n).toBe(true);
    // 说明保留原来的属性提示，再加故事
    expect(goods.get(gid('灵魂之沙利叶的无情之铲'))!.desc).toMatch(/^厨艺\+21。.+/);
    expect(goods.get(gid('神谕之阿卡玛的荣耀之铲'))!.desc).toMatch(/^厨艺\+51。.+/);
    // 数值按强化数值表（问题记录 120）
    expect(goods.get(gid('裁决之巴贝雷特的悲鸣之铲'))!.equip).toMatchObject({
      part: 1,
      total: 31,
      suitId: 6,
    });
  });

  it('阿卡玛五件从厨塔第 8 层起掉落（原来没有获得途径）', () => {
    const { goods } = byId();
    for (const n of ['铲', '刃', '镬', '瓶', '冠'])
      expect(goods.get(gid(`神谕之阿卡玛的荣耀之${n}`))!.awardFlag).toBe(8);
  });

  it('新厨具：沙利叶镬瓶、巴贝雷特镬瓶、古尔图格五件、茵蔯四件', () => {
    const { goods } = byId();
    const parts = (names: string[]) => names.map((n) => goods.get(gid(n))!.equip!.part);
    expect(goods.get(gid('灵魂之沙利叶的无情之镬'))).toMatchObject({
      name: '灵魂之沙利叶的无情之镬',
      awardFlag: 4,
      type: 4,
    });
    expect(goods.get(gid('灵魂之沙利叶的无情之镬'))!.equip).toMatchObject({
      part: 3,
      suitId: 4,
      minLevel: 40,
      total: null,
    });
    expect(goods.get(gid('灵魂之沙利叶的无情之镬'))!.equip!.ranges.fire).toBe(21);
    expect(goods.get(gid('灵魂之沙利叶的无情之瓶'))!.equip!.ranges.season).toBe(21);
    expect(parts(['裁决之巴贝雷特的悲鸣之镬', '裁决之巴贝雷特的悲鸣之瓶'])).toEqual([3, 4]);
    expect(goods.get(gid('裁决之巴贝雷特的悲鸣之镬'))!.equip).toMatchObject({ suitId: 6, total: 31 });
    expect(goods.get(gid('裁决之巴贝雷特的悲鸣之镬'))!.awardFlag).toBe(6);
    expect(parts(['铲', '刃', '镬', '瓶', '冠'].map((n) => '意志之古尔图格的精华之' + n))).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (const id of [gid('意志之古尔图格的精华之铲'), gid('意志之古尔图格的精华之冠')]) {
      expect(goods.get(id)!.equip).toMatchObject({ suitId: 82, total: 41, minLevel: 70 });
      expect(goods.get(id)!.awardFlag).toBe(7);
    }
    expect(parts(['铲', '刃', '镬', '瓶'].map((n) => '堕落之茵蔯的炙热之' + n))).toEqual([1, 2, 3, 4]);
    for (const id of [gid('堕落之茵蔯的炙热之铲'), gid('堕落之茵蔯的炙热之瓶')]) {
      expect(goods.get(id)!.equip).toMatchObject({ suitId: 7, total: 25, minLevel: 50 });
      expect(goods.get(id)!.awardFlag).toBe(5);
    }
    for (const n of [
      '灵魂之沙利叶的无情之镬',
      '灵魂之沙利叶的无情之瓶',
      '裁决之巴贝雷特的悲鸣之镬',
      '裁决之巴贝雷特的悲鸣之瓶',
      ...['铲', '刃', '镬', '瓶', '冠'].map((x) => '意志之古尔图格的精华之' + x),
      ...['铲', '刃', '镬', '瓶'].map((x) => '堕落之茵蔯的炙热之' + x),
    ])
      expect(goods.get(gid(n))!.desc.length).toBeGreaterThan(10);
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
    const { bundle } = realBuild();
    for (const s of bundle!.suits.filter((x) => [4, 5, 6, 7, 80, 82].includes(x.id)))
      expect(bundle!.goods.filter((g) => g.equip?.suitId === s.id)).toHaveLength(s.maxNum);
  });

  it('套装效果键拼错、档位件数超过上限、件数和上限对不上时构建报错（终审 I3）', () => {
    const src = source();
    type Lore = {
      suits: Array<{
        suitid: number;
        maxnum: number;
        tiers: Array<{ neednum: number; value: Record<string, number> }>;
      }>;
    };
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
    const { bundle, errors } = realBuild();
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
    const { bundle } = realBuild();
    expect(bundle!.tuning.mail).toEqual({ expiresDays: 30, listMax: 100 });
  });
});

describe('邀请和兑换码数值（子项目 6A-2）', () => {
  it('邀请：每月 20 人，10 级、30 级两档；兑换：每小时失败 10 次上限，一批最多 1000 个码', () => {
    const { bundle, errors } = realBuild();
    expect(errors).toEqual([]);
    expect(bundle!.tuning.invite).toMatchObject({ monthlyCap: 20, levels: { lv10: 10, lv30: 30 } });
    expect(bundle!.tuning.invite.newbie).toEqual({
      coin: 50000,
      goods: [{ id: GOODS.mysteryTicket, num: 5 }],
    });
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
  it('第 5、6 层互换（名字、称号、台词；属性改由长老装备算，问题记录 408）', () => {
    const { bundle, errors } = realBuild();
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
  });

  it('覆盖文件写了不存在的层时报错', () => {
    const src = source();
    expect(
      buildBundle({ ...src, 'game/tower_fix': { floors: [{ floor: 11, watchman: '某长老' }] } }).errors,
    ).toContain('tower_fix references unknown floor 11');
  });

  it('同一层写了两次时报错（backlog 厨具小修：以前不报错，后一条生效）', () => {
    const src = source();
    const floors = [
      { floor: 3, watchman: '甲' },
      { floor: 3, watchman: '乙' },
    ];
    expect(buildBundle({ ...src, 'game/tower_fix': { floors } }).errors).toContain(
      'tower_fix lists floor 3 twice',
    );
  });
});

describe('赛厨长老（问题记录 408）', () => {
  const elders = () =>
    source()['game/tower_elders'] as { note: string; floors: Array<Record<string, unknown>> };

  it('同一层写两次时报错', () => {
    const e = elders();
    expect(
      buildBundle({ ...source(), 'game/tower_elders': { ...e, floors: [...e.floors, e.floors[0]!] } }).errors,
    ).toContain('tower_elders lists floor 1 twice');
  });

  it('生成器用 ignoreElders 构建：长老数据对不上或缺失时也能出配置（问题记录 408 审查）', () => {
    const r = buildBundle(
      { ...source(), 'game/tower_elders': { note: '', floors: [] } },
      { ignoreElders: true },
    );
    expect(r.errors).toEqual([]);
    expect(r.bundle!.towerFloors).toHaveLength(10);
    expect(
      buildBundle({ ...source(), 'game/tower_elders': null }, { ignoreElders: true }).bundle,
    ).not.toBeNull();
  });

  it('少一层时报错', () => {
    const e = elders();
    expect(
      buildBundle({
        ...source(),
        'game/tower_elders': { ...e, floors: e.floors.filter((f) => f.floor !== 10) },
      }).errors,
    ).toContain('tower_elders misses floor 10');
  });

  it('和厨具配置对不上时报错（加点总数不对）', () => {
    const e = elders();
    const floors = e.floors.map((f) =>
      f.floor === 1 ? { ...f, points: { cook: 0, cutting: 0, fire: 1 } } : f,
    );
    expect(buildBundle({ ...source(), 'game/tower_elders': { ...e, floors } }).errors).toContain(
      'tower_elders floor 1: points sum 1, expected 21',
    );
  });
});

describe('举报数值（子项目 6B-1）', () => {
  it('每天最多举报 10 次', () => {
    expect(realBuild().bundle!.tuning.report).toEqual({ dailyMax: 10 });
  });
});

describe('可疑数据门槛（子项目 6B-2）', () => {
  it('酒吧单日 3 次全过、20 镖 50 分；3 个账号共用；每类 50 行', () => {
    expect(realBuild().bundle!.tuning.ops.suspicious).toEqual({
      barPerfectDaily: 3,
      dartsBullDaily: 20,
      sharedAccounts: 3,
      topN: 50,
    });
  });
});

describe('活跃度新增项目（问题记录 318）', () => {
  it('新增 5 项和 180 档；新动作键映射到活跃度和功能', () => {
    const b = realBuild().bundle!;
    const byName = new Map(b.activationTasks.map((a) => [a.name, a]));
    for (const n of ['交易所成交', '事件预测交易', '一番赏抽赏', '领取限时活动奖励', '论坛发帖或回复'])
      expect(byName.has(n), n).toBe(true);
    const max = b.activationTasks.reduce((s, a) => s + a.points * a.limitTimes, 0);
    expect(max).toBe(193);
    expect(b.activationRewards.map((r) => r.points)).toEqual([50, 100, 120, 150, 180]);
    expect(b.actionMap.activation['exchange.fill']).toBe('交易所成交');
    expect(b.actionMap.activation['post.create']).toBe('论坛发帖或回复');
    expect(b.actionMap.activation['post.reply']).toBe('论坛发帖或回复');
    expect(featureOfKey('kuji.draw', b.actionMap.features)).toBe('kuji');
    expect(featureOfKey('exchange.fill', b.actionMap.features)).toBe('exchange');
    expect(featureOfKey('predict.win', b.actionMap.features)).toBe('predict');
    expect(featureOfKey('activity.claim', b.actionMap.features)).toBe('activity');
  });
});

describe('任务配置（问题记录 318）', () => {
  it('12 章；主线按章排；支线 15 条；每周 3 组各 4 个；id 不重复', () => {
    const b = realBuild().bundle!;
    expect(b.chapters.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const mains = b.quests.filter((q) => q.line === null);
    expect(mains.every((q) => q.id === 2000 + q.chapter * 20 + q.order)).toBe(true);
    expect(new Set(mains.map((q) => q.chapter))).toEqual(new Set(b.chapters.map((c) => c.id)));
    expect(b.questLines).toHaveLength(15);
    const sides = b.quests.filter((q) => q.line !== null);
    expect(sides.every((q) => q.id === 3000 + q.line! * 20 + q.order)).toBe(true);
    expect(b.weeklyGroups.map((g) => [g.key, g.minStar, g.maxStar, g.quests.length])).toEqual([
      ['A', 0, 0, 4],
      ['B', 1, 2, 4],
      ['C', 3, 99, 4],
    ]);
    const ids = [
      ...b.quests.map((q) => q.id),
      ...b.weeklyGroups.flatMap((g) => [g.fullId, ...g.quests.map((q) => q.id)]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('奖励总量和设计一致：主线 1,192 万、支线 381 万银币；经验 = 银币 ÷ 10', () => {
    const b = realBuild().bundle!;
    const coin = (main: boolean) =>
      b.quests.filter((q) => (q.line === null) === main).reduce((s, q) => s + (q.award.coin ?? 0), 0);
    expect(coin(true)).toBe(11_920_000);
    expect(coin(false)).toBe(3_808_000);
    for (const q of b.quests) expect(q.award.exp ?? 0, String(q.id)).toBe((q.award.coin ?? 0) / 10);
  });

  it('条件键都有来源；"all" 换成菜谱总数；支线功能取自档位', () => {
    const b = realBuild().bundle!;
    const all = b.quests.find((q) => q.name === '学会全部食谱')!;
    expect(all.cond.target).toBe(b.cookbooks.length);
    for (const q of b.quests) expect(q.feature, `${q.id} ${q.cond.key}`).not.toBe('');
    for (const g of b.weeklyGroups) for (const q of g.quests) expect(q.feature, String(q.id)).not.toBe('');
    expect(b.questLines.find((l) => l.key === 'kuji')!.feature).toBe('kuji');
    const forum = b.quests.find((q) => q.cond.key === 'post.create|post.reply')!;
    expect(forum.feature).toBe('forum');
  });

  it('引用不存在的章、道具或状态键时报错', () => {
    const src = source();
    const mains = structuredClone(src['designed/quest_main']) as Array<{
      chapter: number;
      cond: { kind: string; key: string };
      award: { goods?: Array<{ id: number; num: number }> };
    }>;
    mains[0]!.chapter = 99;
    mains[1]!.cond = { ...mains[1]!.cond, kind: 'state', key: 'rest.nope' };
    mains[2]!.award = { goods: [{ id: 999999, num: 1 }] };
    const errs = buildBundle({ ...src, 'designed/quest_main': mains }).errors.join();
    expect(errs).toMatch(/unknown chapter 99/);
    expect(errs).toMatch(/unknown state key rest\.nope/);
    expect(errs).toMatch(/999999/);
  });
});

describe('主表的检查（重新编号 PR 1）', () => {
  it('菜谱存储位：重复、超出 next 时构建报错（重新编号 PR 3）', () => {
    const src = source();
    const cookbooks = structuredClone(src['master/cookbooks']) as Array<{ id: number; slot: number }>;
    cookbooks[1]!.slot = cookbooks[0]!.slot;
    cookbooks[2]!.slot = 999_999;
    const { errors } = buildBundle({ ...src, 'master/cookbooks': cookbooks });
    expect(errors).toContain(`cookbooks: duplicate slot ${cookbooks[0]!.slot}`);
    expect(errors).toContain(`cookbook ${cookbooks[2]!.id} slot 999999 >= next 3810`);
  });

  it('道具、食谱编号重复时构建报错', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<{ id: number }>;
    goods.push({ ...goods[0]! });
    const cookbooks = structuredClone(src['master/cookbooks']) as Array<{ id: number }>;
    cookbooks.push({ ...cookbooks[0]! });
    const { errors } = buildBundle({ ...src, 'master/goods': goods, 'master/cookbooks': cookbooks });
    expect(errors).toContain(`goods: duplicate id ${goods[0]!.id}`);
    expect(errors).toContain(`cookbooks: duplicate id ${cookbooks[0]!.id}`);
  });

  it('一番赏主题的手办、基金勋章要在主表里，类型对', () => {
    const src = source();
    const kuji = structuredClone(src['game/kuji']) as { themes: Array<{ figures: { A: number } }> };
    kuji.themes[0]!.figures.A = 999_999;
    kuji.themes[1]!.figures.A = 1; // 神秘礼券不是纪念品
    const fund = structuredClone(src['game/fund']) as { medals: Array<{ id: number }> };
    fund.medals[0]!.id = 1;
    const { errors } = buildBundle({ ...src, 'game/kuji': kuji, 'game/fund': fund });
    expect(errors).toContain('kuji theme 1 figure A 999999 is not a souvenir');
    expect(errors).toContain('kuji theme 2 figure A 1 is not a souvenir');
    expect(errors).toContain('fund medal 1 is not an honor');
  });

  it('食材随机券、基金勋章原来由构建写死的属性，主表里改错了要报错（终审 I1）', () => {
    const src = source();
    type M = { id: number; type: number; use?: unknown; invalidHours: number | null; maxNum: number };
    const goods = structuredClone(src['master/goods']) as M[];
    const g = (id: number) => goods.find((x) => x.id === id)!;
    g(NEWBIE.foodVoucherBase + 4).type = 10; // 不是消耗品
    delete g(NEWBIE.foodVoucherBase + 5).use; // 用不了
    g(NEWBIE.foodVoucherBase + 2).use = { kind: 'randomFood', level: 4 }; // 和编号对不上
    g(GOODS.mysteryTicket).use = { kind: 'randomFood', level: 1 }; // 只有随机券能写用法
    g(FUND.C).invalidHours = null; // 基金勋章变成永久
    g(FUND.B).maxNum = 2;
    const { errors } = buildBundle({ ...src, 'master/goods': goods });
    expect(errors).toContain(`goods ${NEWBIE.foodVoucherBase + 4} voucher must be a consumable`);
    expect(errors).toContain(`goods ${NEWBIE.foodVoucherBase + 5} voucher needs use randomFood`);
    expect(errors).toContain(
      `goods ${NEWBIE.foodVoucherBase + 2} voucher level 4 must be goods ${NEWBIE.foodVoucherBase + 4}`,
    );
    expect(errors).toContain('food voucher for level 2 is missing');
    expect(errors).toContain(`goods ${GOODS.mysteryTicket} use is only for food vouchers`);
    expect(errors).toContain(`fund medal ${FUND.C} needs invalidHours >= 1`);
    expect(errors).toContain(`fund medal ${FUND.B} maxNum must be 1`);
  });
});

describe('新手大礼包和食材随机券（问题记录 331）', () => {
  const b = () => realBuild().bundle!;
  const goods = (id: number) => b().goods.find((g) => g.id === id)!;

  it('一到五级食材随机券：消耗品，使用后随机得一个这一等级的食材', () => {
    const names = ['一级食材随机券', '二级食材随机券', '三级食材随机券', '四级食材随机券', '五级食材随机券'];
    for (let level = 1; level <= 5; level++) {
      const g = goods(NEWBIE.foodVoucherBase + level);
      expect(g).toMatchObject({ name: names[level - 1], type: 0, stackable: true, onSale: false });
      expect(g.use).toEqual({ kind: 'randomFood', level });
    }
  });

  it('新手大礼包能打开：银币、钻石、喇叭、随机万能食材礼包、食材兑换券、宣传海报，外加一二三级食材随机券 50、20、10 张', () => {
    const g = goods(NEWBIE.pack);
    expect(g.use).toEqual({ kind: 'gift' });
    expect(g.gift).toEqual([
      { type: 'coin', min: 50000, max: 50000, rate: 1 },
      { type: 'diamond', min: 50, max: 50, rate: 1 },
      { type: 'goods', id: gid('喇叭'), num: 3, rate: 1 },
      { type: 'goods', id: gid('随机万能食材礼包'), num: 5, rate: 1 },
      { type: 'goods', id: GOODS.levelTicketBase + 1, num: 5, rate: 1 },
      { type: 'goods', id: GOODS.levelTicketBase + 2, num: 3, rate: 1 },
      { type: 'goods', id: gid('普通宣传海报'), num: 1, rate: 1 },
      { type: 'goods', id: NEWBIE.foodVoucherBase + 1, num: 50, rate: 1 },
      { type: 'goods', id: NEWBIE.foodVoucherBase + 2, num: 20, rate: 1 },
      { type: 'goods', id: NEWBIE.foodVoucherBase + 3, num: 10, rate: 1 },
    ]);
  });

  it('随机券那一级没有可抽的食材时构建报错：配错时用券会白扣（质量期 ②）', () => {
    const src = source();
    const foods = structuredClone(src['master/foods']) as Array<Record<string, unknown>>;
    // 五级食材出现权重全改成 0：五级食材随机券抽不出东西
    for (const f of foods) if (f.level === 5) f.odds = 0;
    const { errors } = buildBundle({ ...src, 'master/foods': foods });
    expect(errors).toContain(`goods ${gid('五级食材随机券')} randomFood level 5 has no food to draw`);
  });

  it('大礼包不留原版的 value（30 万金币、500 经验等没人读，容易误会，质量期 ②）', () => {
    expect(goods(NEWBIE.pack).value).toBeNull();
  });

  it('开店送一个新手大礼包；老玩家用新手码补领', () => {
    expect(b().restaurantDefaults.giftGoods).toContainEqual({ id: NEWBIE.pack, num: 1 });
    const code = b().newbieCodes.find((c) => c.code === 'XINSHOULIBAO')!;
    expect(code).toMatchObject({ minLevel: 1, items: { goods: [{ id: NEWBIE.pack, num: 1 }] } });
  });
});

describe('货币回收 240-1 的区服数值（默认值见 docs/design/银币回收-数值.md）', () => {
  it('菜价倍率 0.15；2~5 级食材 ×1.3/2/3/4；2~4 星收 200 万、500 万、1000 万；搬街费星级系数 0.5', () => {
    const { bundle, errors } = buildBundle(readSourceDir(defaultDataDir()));
    expect(errors).toEqual([]);
    const t = bundle!.tuning;
    expect(t.settlement.dishCoinRate).toBe(0.15);
    expect(t.market.levelPriceRate).toEqual([1, 1.3, 2, 3, 4, 1, 1]);
    expect(t.growth.starCoin).toEqual([0, 2000000, 5000000, 10000000]);
    expect(t.growth.moveStarRate).toBe(0.5);
  });
});

describe('限定称号（240-2 称号商店）', () => {
  it('真实数据：十月、十一月各三个限时上架的称号，价格 100 万、300 万、800 万', () => {
    const { bundle } = buildBundle(readSourceDir(defaultDataDir()));
    const shop = bundle!.looks.icons.filter((i) => i.shop);
    expect(shop.map((i) => [i.key, i.shop!.coin])).toEqual([
      ['oct26_s', 1_000_000],
      ['oct26_m', 3_000_000],
      ['oct26_l', 8_000_000],
      ['nov26_s', 1_000_000],
      ['nov26_m', 3_000_000],
      ['nov26_l', 8_000_000],
    ]);
    expect(shop[0]!.shop).toMatchObject({ from: '2026-10-01', to: '2026-11-01' });
  });

  it('价格不是正数、下架不晚于上架时报错', () => {
    const src = source();
    const withIcon = (icon: Record<string, unknown>) => {
      const looks = structuredClone(src['game/looks']) as { icons: Array<Record<string, unknown>> };
      looks.icons.push(icon);
      return buildBundle({ ...src, 'game/looks': looks }).errors;
    };
    const shop = { from: '2026-10-01', to: '2026-11-01' };
    expect(
      withIcon({ key: 'bad_price', title: '坏价格', desc: '', shop: { ...shop, coin: 0 } }).join(' '),
    ).toMatch(/shop\.coin/);
    expect(
      withIcon({
        key: 'bad_time',
        title: '坏时间',
        desc: '',
        shop: { coin: 1, from: '2026-11-01', to: '2026-11-01' },
      }),
    ).toContain('looks: icon bad_time shop must end after it starts');
  });
});

describe('豪华一番赏（240-2）', () => {
  it('真实数据：豪华池 20 张、每张 30 万；豪华签券 90202；十月、十一月的轮换称号', () => {
    const { bundle, errors } = buildBundle(readSourceDir(defaultDataDir()));
    expect(errors).toEqual([]);
    const dx = bundle!.tuning.kuji.deluxe;
    expect(dx).toMatchObject({ price: 300000, dailyBuy: 10, maxDraw: 10, maxPools: 3 });
    expect(dx.tiers.map((x) => [x.key, x.count])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 5],
      ['D', 12],
    ]);
    expect(dx.tiers[0]).toMatchObject({ icon: 'kuji_dx_a', news: 'broadcast' });
    expect(dx.last).toMatchObject({ icon: 'kuji_dx_last', news: 'broadcast' });
    expect(bundle!.goods.find((g) => g.id === GOODS.kujiDeluxeTicket)).toMatchObject({
      name: '豪华签券',
      onSale: false,
    });
    expect(bundle!.kujiDeluxeMonths).toEqual([
      { month: '2026-10', icons: { A: 'kuji_dx_2610_a', last: 'kuji_dx_2610_last' } },
      { month: '2026-11', icons: { A: 'kuji_dx_2611_a', last: 'kuji_dx_2611_last' } },
    ]);
  });

  it('deluxeMonths：年月重复、称号不存在、对照的不是豪华档位时报错', () => {
    const src = source();
    const kuji = structuredClone(src['game/kuji']) as { deluxeMonths: Array<Record<string, unknown>> };
    kuji.deluxeMonths.push({ month: '2026-10', icons: { A: 'kuji_dx_2610_a' } });
    kuji.deluxeMonths.push({ month: '2026-12', icons: { A: 'nope' } });
    kuji.deluxeMonths.push({ month: '2027-01', icons: { Z: 'kuji_dx_a' } });
    const { errors } = buildBundle({ ...src, 'game/kuji': kuji });
    expect(errors).toContain('kuji deluxeMonths duplicate month 2026-10');
    expect(errors).toContain('kuji deluxeMonths 2026-12 icon nope not in looks.icons');
    expect(errors).toContain('kuji deluxeMonths 2027-01 key Z is not a deluxe tier');
  });

  it('deluxeMonths：不存在的月份（13 月、0 月）写不进去（质量期 ②）', () => {
    for (const month of ['2026-13', '2026-00']) {
      const src = source();
      const kuji = structuredClone(src['game/kuji']) as { deluxeMonths: Array<Record<string, unknown>> };
      kuji.deluxeMonths.push({ month, icons: { A: 'kuji_dx_a' } });
      const { bundle, errors } = buildBundle({ ...src, 'game/kuji': kuji });
      expect(bundle).toBeNull();
      expect(errors.join('\n')).toContain('deluxeMonths');
    }
  });

  it('送一番赏券的活跃度档不在活跃奖励里时报错（质量期 ②）', () => {
    const src = source();
    const tuning = structuredClone(src['game/tuning']) as { kuji: { activeTicketPoints: number } };
    tuning.kuji.activeTicketPoints = 123;
    const { errors } = buildBundle({ ...src, 'game/tuning': tuning });
    expect(errors).toContain('tuning.kuji.activeTicketPoints 123 is not an activation reward');
  });
});

describe('编号规则（重新编号 PR 4）', () => {
  it('道具必须在所属小类的号段里；小类不能重叠、不能不存在', () => {
    const src = source();
    const goods = src['master/goods'] as Array<{ id: number; group: string }>;
    goods[0]!.group = 'nope';
    goods[1]!.id = 99999;
    const groups = (
      src['game/goods_groups'] as { groups: Array<{ key: string; base: number; size: number }> }
    ).groups;
    groups[1]!.base = groups[0]!.base + 50;
    const { errors } = buildBundle(src);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`goods ${goods[0]!.id} group nope unknown`),
        expect.stringContaining('goods 99999 outside group'),
        expect.stringContaining(`goods groups ${groups[0]!.key} and ${groups[1]!.key} overlap`),
      ]),
    );
  });

  it('食材、菜谱编号在各自号段里；旧编号不能重复', () => {
    const src = source();
    const foods = src['master/foods'] as Array<{ id: number; legacyId?: number }>;
    foods[0]!.id = 606;
    foods[2]!.legacyId = foods[1]!.legacyId;
    const cbs = src['master/cookbooks'] as Array<{ id: number }>;
    cbs[0]!.id = 18000;
    const { errors } = buildBundle(src);
    expect(errors).toEqual(
      expect.arrayContaining([
        'foods 606 outside 1001~9999',
        `foods: duplicate legacyId ${foods[1]!.legacyId}`,
        'cookbooks 18000 outside 100001~199999',
      ]),
    );
  });

  it('配置包带旧 → 新对照（旧链接跳转、原版获取途径用）', () => {
    const b = realBuild().bundle!;
    const g = b.goods.find((x) => x.name === '神秘礼券')!;
    expect(b.legacy.goods).toContainEqual([1, g.id]);
    expect(b.legacy.foods.length).toBe(b.foods.length);
    expect(b.legacy.cookbooks.length).toBe(b.cookbooks.length);
  });
});

describe('主表手写定义的格式检查（质量期第 ⑦ 批）', () => {
  type M = Record<string, unknown> & { id: number; src: string };
  const withGoods = (edit: (goods: M[]) => void) => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as M[];
    edit(goods);
    return buildBundle({ ...src, 'master/goods': goods }).errors;
  };
  const first = (goods: M[], s: string) => goods.find((g) => g.src === s)!;

  it('海报奖杯：value 要有 time ≥ 1，只能写 coinValue / expValue，数值为正', () => {
    let id = 0;
    const errors = withGoods((goods) => {
      const p = first(goods, 'poster');
      id = p.id;
      p.value = { time: 0, coinValue: -1, atRate: 0.1 };
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        `goods ${id} poster value time must be an integer >= 1`,
        `goods ${id} poster value coinValue must be > 0`,
        `goods ${id} poster value key atRate not allowed`,
      ]),
    );
  });

  it('海报奖杯：time 是整数，加成恰好写一项，类型是设施（backlog 第 ⑦ 批）', () => {
    let ids: number[] = [];
    const errors = withGoods((goods) => {
      const ps = goods.filter((g) => g.src === 'poster');
      ps[0]!.value = { time: 1.5, coinValue: 8 };
      ps[1]!.value = { time: 24 };
      ps[2]!.value = { time: 24, coinValue: 8, expValue: 8 };
      ps[3]!.type = 1;
      ids = ps.slice(0, 4).map((g) => g.id);
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        `goods ${ids[0]} poster value time must be an integer >= 1`,
        `goods ${ids[1]} poster value needs exactly one of coinValue / expValue`,
        `goods ${ids[2]} poster value needs exactly one of coinValue / expValue`,
        `goods ${ids[3]} poster must be a device`,
      ]),
    );
  });

  it('主表缺 value 时报错带道具编号（backlog 第 ⑦ 批）', () => {
    let id = 0;
    const errors = withGoods((goods) => {
      const g = first(goods, 'poster');
      id = g.id;
      delete g.value;
    });
    expect(errors.some((e) => e.includes(`goods ${id}`))).toBe(true);
  });

  it('只有海报奖杯能写 needStar；纪念品、一番赏手办必须是纪念品类型；抽赏券必须是消耗品', () => {
    let ids: number[] = [];
    const errors = withGoods((goods) => {
      const o = first(goods, 'original');
      o.needStar = 3;
      const s = first(goods, 'souvenir');
      s.type = 1;
      const k = goods.find((g) => g.id === GOODS.kujiTicket)!;
      k.type = 1;
      ids = [o.id, s.id, k.id];
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        `goods ${ids[0]} needStar only for posters`,
        `goods ${ids[1]} src souvenir must be type souvenir`,
        `goods ${ids[2]} kuji ticket must be a consumable`,
      ]),
    );
  });

  it('道具定义必须写 value 键（没有就写 null）', () => {
    let id = 0;
    const errors = withGoods((goods) => {
      const g = first(goods, 'original');
      id = g.id;
      delete g.value;
    });
    expect(errors.join('\n')).toContain('master/goods');
    expect(errors.join('\n')).toContain('value');
    expect(id).toBeGreaterThan(0);
  });

  it('legacyId 不能落在同类的新号段里（不然旧链接会把合法的新编号跳走）', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as M[];
    goods[0]!.legacyId = goods[1]!.id;
    const { errors } = buildBundle({ ...src, 'master/goods': goods });
    expect(errors).toContain(`goods ${goods[0]!.id} legacyId ${goods[1]!.id} is in the new id range`);
  });

  it('街道和勋章说明里写的最终银币、经验收益要和勋章数值一致（问题记录 378：说明是手写的）', () => {
    const src = source();
    const en = structuredClone(src['i18n/en/streets']) as Record<string, { desc?: string }>;
    en['1']!.desc = 'Final EXP and coins +99%, luck +10';
    const goods = structuredClone(src['master/goods']) as M[];
    const medal = goods.find((g) => g.id === 60012)!;
    medal.desc = '最终经验收益+1%,幸运值+10';
    const { errors } = buildBundle({ ...src, 'i18n/en/streets': en, 'master/goods': goods });
    // 勋章实际数值从真实数据读，测试不跟着数值改
    const real = realBuild().bundle!;
    const has = (id: number) => {
      const e = real.goods.find((g) => g.id === id)!.effects;
      const p = (x = 0) => `${x >= 0 ? '+' : ''}${Math.round(x * 1000) / 10}%`;
      return `medal ${id} has coin ${p(e.coinRate)} exp ${p(e.expRate)}`;
    };
    expect(errors).toEqual(
      expect.arrayContaining([
        `street 1 desc (en) says final coin +99% exp +99%, ${has(60001)}`,
        `goods 60012 desc (zh-CN) says final coin +0% exp +1%, ${has(60012)}`,
      ]),
    );
  });

  it('街道带主题说明和类型（问题记录 380、378 方案 C）：除新手街外都要写，英法西有主题译文', () => {
    const b = realBuild().bundle!;
    const japan = b.streets.find((s) => s.id === 14)!;
    expect(japan.theme).toContain('精致料理');
    expect(japan.focus).toBe('coin');
    expect(b.streets.find((s) => s.id === 0)!.focus).toBeNull();
    for (const s of b.streets.filter((x) => x.id > 0)) {
      expect(s.theme, `street ${s.id}`).not.toBe('');
      expect(['coin', 'balanced', 'exp'], `street ${s.id}`).toContain(s.focus);
    }
    for (const l of ['en', 'fr', 'es'] as const)
      for (const s of b.streets) expect(b.i18n[l].streets[String(s.id)]?.theme, `${l} ${s.id}`).toBeTruthy();
  });

  it('街道类型只能是 coin、balanced、exp', () => {
    const src = source();
    const streets = structuredClone(src['dataset/streets']) as Array<Record<string, unknown>>;
    streets[1]!.focus = 'gold';
    const { errors } = buildBundle({ ...src, 'dataset/streets': streets });
    expect(errors.join('\n')).toContain('focus');
  });

  it('equip_lore.json 多写的顶层键报错（不悄悄丢掉）', () => {
    const src = source();
    const lore = { ...(src['game/equip_lore'] as object), rename: [] };
    const { errors } = buildBundle({ ...src, 'game/equip_lore': lore });
    expect(errors.join('\n')).toMatch(/equip_lore.*rename|rename.*equip_lore/);
  });
});
