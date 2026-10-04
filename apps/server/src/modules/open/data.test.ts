import { describe, expect, it } from 'vitest';
import { WIKI_HIDDEN_GOODS } from '@dt/config';
import { testConfig } from '../../../test/config';
import { createOpenData } from './data';

const config = testConfig();
const data = createOpenData(config);
const b = config.bundle;

describe('开放接口数据（问题记录 142）', () => {
  it('索引：版本、五种语言、各类数量', () => {
    const x = data.index('en');
    expect(x).toMatchObject({ version: config.version, lang: 'en' });
    expect(x.langs).toEqual(['zh-CN', 'zh-TW', 'en', 'fr', 'es']);
    expect(x.counts).toEqual({
      goods: b.goods.length - WIKI_HIDDEN_GOODS.size,
      foods: b.foods.length,
      cookbooks: b.cookbooks.length,
      equips: b.goods.filter((g) => g.equip && !WIKI_HIDDEN_GOODS.has(g.id)).length,
      streets: b.streets.length,
    });
  });

  it('道具列表不含隐藏道具；名字按语言', () => {
    const zh = data.goods('zh-CN').items;
    expect(zh.some((g) => WIKI_HIDDEN_GOODS.has(g.id))).toBe(false);
    expect(zh.find((g) => g.id === 1)!.name).toBe(config.goods.get(1)!.name);
    expect(data.goods('en').items.find((g) => g.id === 1)!.name).toBe(b.i18n.en!.goods['1']!.name);
    for (const id of WIKI_HIDDEN_GOODS) expect(data.goodsDetail('zh-CN', id)).toBeNull();
    expect(data.goodsDetail('zh-CN', 999_999)).toBeNull();
  });

  it('礼包内容只给种类和数量、不给概率；随机道具、随机食材、万能食材、随机银币分开写', () => {
    const g = data.goodsDetail('zh-CN', 115)!;
    expect(g.gift).toEqual(
      expect.arrayContaining([
        { kind: 'goods', id: 1, name: config.goods.get(1)!.name, num: 20 },
        { kind: 'randomGoods', level: 7, num: 1 },
        { kind: 'masterFoods', num: 1 },
        { kind: 'coin', min: 1000, max: 19999 },
      ]),
    );
    expect(JSON.stringify(g.gift)).not.toContain('rate');
    const lv = b.goods.find((x) => x.gift?.some((i) => i.type === 'foods' && i.flag === '1'))!;
    expect(data.goodsDetail('zh-CN', lv.id)!.gift).toContainEqual({ kind: 'randomFoods', level: 1, num: 2 });
  });

  it('来源：商店在售时写价格；声望商店；兑换得到和兑换用途', () => {
    expect(data.goodsDetail('zh-CN', 10)!.sources.shop).toEqual({ coin: 1000, diamond: 0 });
    expect(data.goodsDetail('zh-CN', 115)!.sources.shop).toBeNull();
    expect(data.goodsDetail('zh-CN', 310)!.sources.renownShop).toEqual({ renown: 60, rotating: false });
    const rule = b.goodsExchange[0]!;
    const made = data.goodsDetail('zh-CN', rule.goodsId)!.sources.exchange;
    expect(made.map((r) => r.need.map((n) => n.goodsId))).toContainEqual(rule.need.map((n) => n.goodsId));
    const use = data.goodsDetail('zh-CN', rule.need[0]!.goodsId)!.usedIn;
    expect(use.map((r) => r.goodsId)).toContain(rule.goodsId);
  });

  it('厨具详情带强化表；厨具列表的 +10 总和是强化表末项', () => {
    const eq = data.goodsDetail('zh-CN', 30)!.equip!;
    expect(eq).toMatchObject({ part: 1, stressTable: [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18] });
    const list = data.equips('zh-CN');
    expect(list.items.find((x) => x.id === 30)).toMatchObject({ part: 1, maxTotal: 18 });
    expect(list.suits.length).toBe(b.suits.length);
  });

  it('食材详情：用到它的菜谱（最低品级）、特色菜、种子', () => {
    const food = data.food('zh-CN', 239)!;
    expect(food.cookbooks).toContainEqual({
      id: 1,
      name: '南煎丸子',
      streetId: config.cookbooks.get(1)!.streetId,
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
    const c = data.cookbook('zh-CN', 1)!;
    expect(c.grades).toHaveLength(10);
    expect(c.grades[0]!.foods.map((f) => f.foodsId)).toEqual([239, 242, 250]);
    expect(c.desc).toBe(config.cookbooks.get(1)!.desc);
    expect(data.cookbook('en', 1)!.desc).toBeNull();
    expect(data.cookbook('en', 1)!.name).toBe(b.i18n.en!.cookbooks['1']!.name);
    expect(data.cookbooks('zh-CN').items).toHaveLength(b.cookbooks.length);
  });

  it('道具详情带需要的星级；宝石带下一阶的名字（backlog 146、#115）', () => {
    expect(data.goodsDetail('zh-CN', 93202)!.needStar).toBe(6);
    expect(data.goodsDetail('zh-CN', 13)!.needStar).toBe(0);
    const gem = b.goods.find((g) => g.gem && g.gem.nextId !== null)!;
    const next = b.goods.find((g) => g.id === gem.gem!.nextId)!;
    expect(data.goodsDetail('zh-CN', gem.id)!.gem).toMatchObject({ nextId: next.id, nextName: next.name });
    expect(data.goodsDetail('en', gem.id)!.gem!.nextName).toBe(data.goodsDetail('en', next.id)!.name);
  });

  it('街道：勋章和对照表一致，各街菜谱数合计等于菜谱总数', () => {
    const s = data.streets('zh-CN').items;
    expect(s).toHaveLength(b.streets.length);
    expect(s.find((x) => x.id === 0)!.medal!.id).toBe(config.streets.get(0)!.medalId);
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
    const cb = d.cookbooks('zh-CN').items.find((x) => x.id === 194)!;
    expect(cb.coin).toBe(Math.floor(config.requireCookbook(194).coin * 0.5));
    const f = d.foods('zh-CN').items[0]!;
    expect(f.coin).toBe(config.requireFood(f.id).coin * 2);
  });
});
