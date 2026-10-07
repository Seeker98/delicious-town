import { describe, expect, it } from 'vitest';
import { GOODS, WIKI_HIDDEN_GOODS, createGameConfig } from '@dt/config';
import { testConfig } from '../../../test/config';
import { createOpenData } from './data';
import { cid, fid, gid } from '../../../test/items';

const config = testConfig();
const data = createOpenData(config);
const b = config.bundle;

describe('开放接口数据（问题记录 142）', () => {
  it('索引：版本、五种语言、各类数量', () => {
    const x = data.index('en');
    expect(x).toMatchObject({ version: config.version, lang: 'en' });
    expect(x.langs).toEqual(['zh-CN', 'zh-TW', 'en', 'fr', 'es']);
    expect(x.counts).toEqual({
      // 后台专用的、下架的（问题记录 367）都不算
      goods: b.goods.filter((g) => !WIKI_HIDDEN_GOODS.has(g.id) && !g.retired).length,
      foods: b.foods.filter((f) => !f.retired).length,
      cookbooks: b.cookbooks.length,
      equips: b.goods.filter((g) => g.equip && !WIKI_HIDDEN_GOODS.has(g.id) && !g.retired).length,
      streets: b.streets.length,
    });
  });

  it('索引带玩法攻略用的数（backlog 384：攻略里的数不再写死），按默认配置算', () => {
    const g = data.index('en').guide;
    const start = b.restaurantDefaults.streetId;
    const startStreet = data.streets('en').items.find((s) => s.id === start)!;
    expect(g.startStreet).toEqual({
      name: startStreet.name,
      cookbooks: b.cookbooks.filter((c) => c.streetId === start).length,
    });
    expect(g.star2Cookbooks).toBe(config.starNeed.get(2)!.needCookbooks);
    const counts = data.streets('en').items;
    const top = counts.reduce((x, y) => (y.cookbookCount > x.cookbookCount ? y : x));
    expect(g.biggestStreet).toEqual({ name: top.name, cookbooks: top.cookbookCount });
    const t = b.tuning;
    expect(g.takeaway).toEqual({
      star: t.takeaway.openStar,
      renown: t.takeaway.openRenown,
      coin: t.takeaway.openCoin,
      diamond: t.takeaway.openDiamond,
    });
    expect(g.exchange).toEqual({ level: t.exchange.minLevel, days: t.exchange.minAccountDays });
    // 事件预测有自己的门槛（审查 I1）
    expect(g.predict).toEqual({ level: t.predict.minLevel, days: t.predict.minAccountDays });
    expect(g.newbieExp).toEqual({
      maxLevel: t.settlement.newbieExp.maxLevel,
      rate: t.settlement.newbieExp.rate,
    });
    // 收购（收购 PR 3）
    const a = t.acquire;
    expect(g.acquire).toEqual({
      minStar: a.minStar,
      taxRate: a.taxRate,
      maxHoldings: a.maxHoldings,
      dividendRate: a.dividendRate,
      tendBonus: a.tendBonus,
      minRounds: a.minRounds,
      tendFoods: a.tendFoods,
      protectDays: a.protectDays,
    });
  });

  it('道具列表不含隐藏道具；名字按语言', () => {
    const zh = data.goods('zh-CN').items;
    expect(zh.some((g) => WIKI_HIDDEN_GOODS.has(g.id))).toBe(false);
    expect(zh.find((g) => g.id === GOODS.mysteryTicket)!.name).toBe(
      config.goods.get(GOODS.mysteryTicket)!.name,
    );
    expect(data.goods('en').items.find((g) => g.id === GOODS.mysteryTicket)!.name).toBe(
      b.i18n.en!.goods[String(GOODS.mysteryTicket)]!.name,
    );
    for (const id of WIKI_HIDDEN_GOODS) expect(data.goodsDetail('zh-CN', id)).toBeNull();
    expect(data.goodsDetail('zh-CN', 999_999)).toBeNull();
  });

  it('礼包内容只给种类和数量、不给概率；随机道具、指定食材、万能食材、随机银币分开写', () => {
    const g = data.goodsDetail('zh-CN', GOODS.signInGift)!;
    expect(g.gift).toEqual(
      expect.arrayContaining([
        {
          kind: 'goods',
          id: GOODS.mysteryTicket,
          name: config.goods.get(GOODS.mysteryTicket)!.name,
          num: 20,
        },
        { kind: 'randomGoods', level: 7, num: 1 },
        { kind: 'masterFoods', num: 1 },
        { kind: 'coin', min: 1000, max: 19999 },
        // 钻石 1~5（问题记录 511，用户 2026-10-07 定；原来 1~3）：数据里写 [1, 6)
        { kind: 'diamond', min: 1, max: 5 },
      ]),
    );
    expect(JSON.stringify(g.gift)).not.toContain('rate');
    // 指定的食材写名字和数量（问题记录 455：新手大礼包里的一级万能食材 ×10）；现在没有按等级随机给食材的礼包了
    expect(data.goodsDetail('zh-CN', gid('新手大礼包'))!.gift).toContainEqual({
      kind: 'foods',
      id: fid('一级万能食材'),
      name: '一级万能食材',
      num: 10,
    });
  });

  it('来源还有今日特价、钻石黑市、随机奖励、宝石升阶（视觉第三轮：原来只写商店）', () => {
    const t1 = data.goodsDetail('zh-CN', gid('[一阶]•天机原石'))!.sources;
    expect(t1).toMatchObject({ special: true, black: 12, award: true, gemFrom: null });
    const t2 = data.goodsDetail('zh-CN', gid('[二阶]•天机灵石'))!.sources;
    expect(t2).toMatchObject({ special: false, black: null, award: true });
    expect(t2.gemFrom).toEqual({ id: gid('[一阶]•天机原石'), name: '[一阶]•天机原石' });
    // 六阶不进随机奖励
    expect(data.goodsDetail('zh-CN', gid('[六阶]•天机神玉'))!.sources.award).toBe(false);
  });

  it('来源：商店在售时写价格；声望商店；兑换得到和兑换用途', () => {
    expect(data.goodsDetail('zh-CN', gid('小镇食神奖杯(铜)'))!.sources.shop).toEqual({
      coin: 1000,
      diamond: 0,
    });
    expect(data.goodsDetail('zh-CN', GOODS.signInGift)!.sources.shop).toBeNull();
    expect(data.goodsDetail('zh-CN', GOODS.dtTicket)!.sources.renownShop).toEqual({
      renown: 60,
      rotating: false,
    });
    const rule = b.goodsExchange[0]!;
    const made = data.goodsDetail('zh-CN', rule.goodsId)!.sources.exchange;
    expect(made.map((r) => r.need.map((n) => n.goodsId))).toContainEqual(rule.need.map((n) => n.goodsId));
    const use = data.goodsDetail('zh-CN', rule.need[0]!.goodsId)!.usedIn;
    expect(use.map((r) => r.goodsId)).toContain(rule.goodsId);
  });

  it('厨具详情带强化表；厨具列表的 +10 总和是强化表末项', () => {
    const eq = data.goodsDetail('zh-CN', gid('见习之铲'))!.equip!;
    expect(eq).toMatchObject({ part: 1, stressTable: [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18] });
    const list = data.equips('zh-CN');
    expect(list.items.find((x) => x.id === gid('见习之铲'))).toMatchObject({ part: 1, maxTotal: 18 });
    expect(list.suits.length).toBe(b.suits.length);
  });

  it('食材详情：用到它的菜谱（最低品级）、特色菜、种子', () => {
    const food = data.food('zh-CN', fid('猪肉'))!;
    expect(food.cookbooks).toContainEqual({
      id: cid('南煎丸子'),
      name: '南煎丸子',
      streetId: config.cookbooks.get(cid('南煎丸子'))!.streetId,
      grade: 1,
    });
    expect(food.cookbooks.map((c) => c.id)).toEqual(
      [...food.cookbooks.map((c) => c.id)].sort((x, y) => x - y),
    );
    const seed = b.seeds[0]!;
    expect(data.food('zh-CN', seed.foodsId)!.seed).toEqual({ id: seed.id, harvestNum: seed.harvestNum });
    const mc = b.mysteriousCookbooks[0]!;
    expect(data.food('zh-CN', mc.foods[0]!)!.mysterious.map((m) => m.id)).toContain(mc.id);
    expect(data.food('zh-CN', 999_999)).toBeNull();
  });

  it('菜谱详情：10 个品级的食材带名字；描述只在简中给', () => {
    const c = data.cookbook('zh-CN', cid('南煎丸子'))!;
    expect(c.grades).toHaveLength(10);
    expect(c.grades[0]!.foods.map((f) => f.foodsId)).toEqual([fid('猪肉'), fid('鸡蛋'), fid('香葱')]);
    expect(c.desc).toBe(config.cookbooks.get(cid('南煎丸子'))!.desc);
    expect(data.cookbook('en', cid('南煎丸子'))!.desc).toBeNull();
    expect(data.cookbook('en', cid('南煎丸子'))!.name).toBe(
      b.i18n.en!.cookbooks[String(cid('南煎丸子'))]!.name,
    );
    expect(data.cookbooks('zh-CN').items).toHaveLength(b.cookbooks.length);
  });

  it('道具详情带需要的星级；宝石带下一阶的名字（backlog 146、#115）', () => {
    expect(data.goodsDetail('zh-CN', gid('镇长宣传海报'))!.needStar).toBe(6);
    expect(data.goodsDetail('zh-CN', gid('普通宣传海报'))!.needStar).toBe(0);
    const gem = b.goods.find((g) => g.gem && g.gem.nextId !== null)!;
    const next = b.goods.find((g) => g.id === gem.gem!.nextId)!;
    expect(data.goodsDetail('zh-CN', gem.id)!.gem).toMatchObject({ nextId: next.id, nextName: next.name });
    expect(data.goodsDetail('en', gem.id)!.gem!.nextName).toBe(data.goodsDetail('en', next.id)!.name);
  });

  it('宝石的下一阶在配置里不存在时 nextName 是 null，不写编号（backlog 第 ⑤ 批）', () => {
    const gem = b.goods.find((g) => g.gem && g.gem.nextId !== null)!;
    const broken = createGameConfig({
      ...b,
      goods: b.goods.map((g) => (g.id === gem.id ? { ...g, gem: { ...g.gem!, nextId: 99999999 } } : g)),
    });
    expect(createOpenData(broken).goodsDetail('zh-CN', gem.id)!.gem!.nextName).toBeNull();
  });

  it('街道：勋章和对照表一致，各街菜谱数合计等于菜谱总数', () => {
    const s = data.streets('zh-CN').items;
    expect(s).toHaveLength(b.streets.length);
    expect(s.find((x) => x.id === 0)!.medal!.id).toBe(config.streets.get(0)!.medalId);
    // 主题说明和街道类型（问题记录 380、378 方案 C）
    expect(s.find((x) => x.id === 14)).toMatchObject({
      theme: expect.stringContaining('精致料理'),
      focus: 'coin',
    });
    expect(data.streets('en').items.find((x) => x.id === 14)!.theme).toContain('knife skills');
    expect(s.reduce((n, x) => n + x.cookbookCount, 0)).toBe(b.cookbooks.length);
  });
});

describe('售价按默认数值算（240-1）', () => {
  it('菜谱乘菜价倍率，食材乘本等级价格倍数', () => {
    const tuning = {
      ...config.tuning,
      settlement: { ...config.tuning.settlement, dishCoinRate: 0.5 },
      market: { ...config.tuning.market, levelPriceRate: [2, 2, 2, 2, 2, 2, 2] },
    };
    // 保留原型上的方法，只换 tuning
    const cfg = Object.assign(Object.create(Object.getPrototypeOf(config)), config, {
      tuning,
    }) as typeof config;
    const d = createOpenData(cfg);
    const cb = d.cookbooks('zh-CN').items.find((x) => x.id === cid('桑椹葡萄粥'))!;
    expect(cb.coin).toBe(Math.floor(config.requireCookbook(cid('桑椹葡萄粥')).coin * 0.5));
    const f = d.foods('zh-CN').items[0]!;
    expect(f.coin).toBe(config.requireFood(f.id).coin * 2);
  });
});

describe('下架的道具、食材不上开放接口（问题记录 367）', () => {
  const goodsId = GOODS.mysteryTicket;
  const foodId = b.foods[0]!.id;
  const retired = createOpenData(
    createGameConfig({
      ...b,
      goods: b.goods.map((g) => (g.id === goodsId ? { ...g, retired: true as const } : g)),
      foods: b.foods.map((f) => (f.id === foodId ? { ...f, retired: true as const } : f)),
    }),
  );

  it('列表和数量不含，详情是 null', () => {
    expect(retired.goods('zh-CN').items.some((g) => g.id === goodsId)).toBe(false);
    expect(retired.goodsDetail('zh-CN', goodsId)).toBeNull();
    expect(retired.foods('zh-CN').items.some((f) => f.id === foodId)).toBe(false);
    expect(retired.food('zh-CN', foodId)).toBeNull();
    expect(retired.index('zh-CN').counts.goods).toBe(data.index('zh-CN').counts.goods - 1);
    expect(retired.index('zh-CN').counts.foods).toBe(b.foods.length - 1);
  });
});
