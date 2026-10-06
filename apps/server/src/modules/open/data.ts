import { dishCoin, foodPrice } from '../../core/prices';
import {
  WIKI_HIDDEN_GOODS,
  type GameConfig,
  type GiftItem,
  type Goods,
  type GoodsExchange,
  type I18nEntry,
  type I18nKind,
  type RenownShopItem,
} from '@dt/config';
import {
  type OpenGuideNumbers,
  LOCALES,
  type Locale,
  type OpenCookbookBrief,
  type OpenCookbookDto,
  type OpenEquipBrief,
  type OpenEquipsDto,
  type OpenExchangeRule,
  type OpenFoodBrief,
  type OpenFoodDto,
  type OpenGiftItem,
  type OpenGoodsBrief,
  type OpenGoodsDto,
  type OpenIndexDto,
  type OpenListDto,
  type OpenStreetDto,
} from '@dt/shared';

export const OPEN_ENDPOINTS = [
  '/api/v1/open',
  '/api/v1/open/goods',
  '/api/v1/open/goods/:id',
  '/api/v1/open/foods',
  '/api/v1/open/foods/:id',
  '/api/v1/open/cookbooks',
  '/api/v1/open/cookbooks/:id',
  '/api/v1/open/equips',
  '/api/v1/open/streets',
];

/**
 * 开放接口的数据（问题记录 142，设计 §2）：全部从配置包算，不读数据库。
 * 反向索引（食材 → 菜谱、特色菜、种子；道具 → 兑换）建一次；名字按语言从配置包的翻译表取
 */
export function createOpenData(config: GameConfig) {
  const b = config.bundle;
  const hidden = WIKI_HIDDEN_GOODS;
  // 下架的道具、食材（问题记录 367）和后台专用的一样不显示
  const visible = (id: number) => !hidden.has(id) && config.goods.has(id) && !config.goods.get(id)!.retired;
  const goodsList = b.goods.filter((g) => visible(g.id));
  const foodsList = b.foods.filter((f) => !f.retired);
  const equipGoods = goodsList.filter((g) => g.equip !== null);

  /** 食材 → 用到它的菜谱（同一道菜只记最低品级） */
  const foodCookbooks = new Map<number, Map<number, number>>();
  for (const c of b.cookbooks)
    for (let grade = 1; grade <= 10; grade++)
      for (const f of c.needFoods[grade] ?? []) {
        let m = foodCookbooks.get(f.foodsId);
        if (!m) foodCookbooks.set(f.foodsId, (m = new Map()));
        if (!m.has(c.id)) m.set(c.id, grade);
      }
  const foodMc = new Map<number, number[]>();
  for (const mc of b.mysteriousCookbooks)
    for (const f of new Set(mc.foods)) foodMc.set(f, [...(foodMc.get(f) ?? []), mc.id]);
  const seedByFood = new Map(b.seeds.map((s) => [s.foodsId, s]));
  // 兑换规则：涉及隐藏道具的整条不出
  const rules = b.goodsExchange.filter((r) => visible(r.goodsId) && r.need.every((n) => visible(n.goodsId)));
  // 宝石的上一阶：两颗合成下一阶（视觉第三轮：来源写升阶）
  const gemFrom = new Map<number, number>();
  for (const g of config.bundle.goods) if (g.gem?.nextId && visible(g.id)) gemFrom.set(g.gem.nextId, g.id);
  const specialPool = new Set(config.bundle.shopPools.special);
  const blackPool = new Set(config.bundle.shopPools.black);
  const madeBy = new Map<number, GoodsExchange[]>();
  const usedBy = new Map<number, GoodsExchange[]>();
  for (const r of rules) {
    madeBy.set(r.goodsId, [...(madeBy.get(r.goodsId) ?? []), r]);
    for (const n of new Set(r.need.map((x) => x.goodsId))) usedBy.set(n, [...(usedBy.get(n) ?? []), r]);
  }
  // 有前置玩法（仙珍、天馔）的声望商品暂不上架，不算来源
  const renown = new Map<number, RenownShopItem>(
    b.renownShop.filter((r) => r.require === null).map((r) => [r.goodsId, r]),
  );
  const cookbookCount = new Map<number, number>();
  for (const c of b.cookbooks) cookbookCount.set(c.streetId, (cookbookCount.get(c.streetId) ?? 0) + 1);

  const table = (lang: Locale) => (lang === 'zh-CN' ? undefined : b.i18n[lang]);
  const entry = (lang: Locale, kind: I18nKind, id: number): I18nEntry | undefined =>
    table(lang)?.[kind][String(id)];
  const goodsName = (lang: Locale, g: Goods) => entry(lang, 'goods', g.id)?.name ?? g.name;
  const nameOf = (lang: Locale, id: number) => {
    const g = config.goods.get(id);
    return g ? goodsName(lang, g) : String(id);
  };
  const foodName = (lang: Locale, id: number) =>
    entry(lang, 'foods', id)?.name ?? config.foods.get(id)?.name ?? String(id);
  const cookbookName = (lang: Locale, id: number) =>
    entry(lang, 'cookbooks', id)?.name ?? config.cookbooks.get(id)?.name ?? String(id);
  const meta = (lang: Locale) => ({ version: config.version, lang });
  /** 玩法攻略里的数（backlog 384）：默认配置；菜最多的街取编号最小的那条 */
  const guideNumbers = (lang: Locale): OpenGuideNumbers => {
    const t = b.tuning;
    const top = b.streets.reduce((x, y) =>
      (cookbookCount.get(y.id) ?? 0) > (cookbookCount.get(x.id) ?? 0) ? y : x,
    );
    return {
      startStreetCookbooks: cookbookCount.get(b.restaurantDefaults.streetId) ?? 0,
      star2Cookbooks: config.starNeed.get(2)?.needCookbooks ?? 0,
      biggestStreet: {
        name: entry(lang, 'streets', top.id)?.name ?? top.name,
        cookbooks: cookbookCount.get(top.id) ?? 0,
      },
      takeaway: {
        star: t.takeaway.openStar,
        renown: t.takeaway.openRenown,
        coin: t.takeaway.openCoin,
        diamond: t.takeaway.openDiamond,
      },
      exchange: { level: t.exchange.minLevel, days: t.exchange.minAccountDays },
      newbieExp: { maxLevel: t.settlement.newbieExp.maxLevel, rate: t.settlement.newbieExp.rate },
    };
  };

  const goodsBrief = (lang: Locale, g: Goods): OpenGoodsBrief => ({
    id: g.id,
    name: goodsName(lang, g),
    type: g.type,
    level: g.level,
    coin: g.coin,
    diamond: g.diamond,
    onSale: g.onSale,
  });
  const rule = (lang: Locale, r: GoodsExchange): OpenExchangeRule => ({
    goodsId: r.goodsId,
    goodsName: nameOf(lang, r.goodsId),
    num: r.num,
    need: r.need.map((n) => ({ goodsId: n.goodsId, name: nameOf(lang, n.goodsId), num: n.num })),
    times: r.times,
  });
  /** 礼包项：只给种类和数量，不给概率；银币等是 [min, max) 的随机数，对外写成含两端的 min~max */
  const giftItem = (lang: Locale, i: GiftItem): OpenGiftItem | null => {
    switch (i.type) {
      case 'goods':
        if (i.id > 0)
          return visible(i.id) ? { kind: 'goods', id: i.id, name: nameOf(lang, i.id), num: i.num } : null;
        return { kind: 'randomGoods', level: i.level ?? 1, num: i.num };
      case 'foods':
        if (i.id !== undefined && i.id > 0)
          return { kind: 'foods', id: i.id, name: foodName(lang, i.id), num: i.num };
        if (i.flag === 'master') return { kind: 'masterFoods', num: i.num };
        return { kind: 'randomFoods', level: Number(i.flag), num: i.num };
      case 'renown':
        return { kind: 'renown', num: i.num };
      default:
        return { kind: i.type, min: i.min, max: i.max > i.min ? i.max - 1 : i.min };
    }
  };
  const foodBrief = (lang: Locale, id: number): OpenFoodBrief => {
    const f = config.foods.get(id)!;
    return {
      id: f.id,
      name: foodName(lang, f.id),
      level: f.level,
      coin: Math.round(foodPrice(f, config.tuning.market)),
      rare: f.odds < 100,
      type: f.type,
    };
  };
  const cookbookBrief = (lang: Locale, id: number): OpenCookbookBrief => {
    const c = config.cookbooks.get(id)!;
    return {
      id: c.id,
      name: cookbookName(lang, c.id),
      streetId: c.streetId,
      level: c.level,
      coin: dishCoin(c.coin, config.tuning.settlement.dishCoinRate),
    };
  };

  /** 重新编号前的编号对应的新编号（设计 §5）；不是旧编号时 undefined */
  const moved = (kind: 'goods' | 'foods' | 'cookbooks', id: number) => config.legacy[kind].get(id);

  return {
    moved,
    index(lang: Locale): OpenIndexDto {
      return {
        ...meta(lang),
        langs: [...LOCALES],
        counts: {
          goods: goodsList.length,
          foods: foodsList.length,
          cookbooks: b.cookbooks.length,
          equips: equipGoods.length,
          streets: b.streets.length,
        },
        endpoints: OPEN_ENDPOINTS,
        guide: guideNumbers(lang),
      };
    },

    goods(lang: Locale): OpenListDto<OpenGoodsBrief> {
      return { ...meta(lang), items: goodsList.map((g) => goodsBrief(lang, g)) };
    },

    goodsDetail(lang: Locale, id: number): OpenGoodsDto | null {
      const g = config.goods.get(id);
      if (!g || !visible(id)) return null;
      const r = renown.get(id);
      const suit = g.equip ? config.suits.get(g.equip.suitId) : undefined;
      return {
        ...meta(lang),
        ...goodsBrief(lang, g),
        desc: entry(lang, 'goods', id)?.desc ?? g.desc,
        stackable: g.stackable,
        maxNum: g.maxNum,
        invalidHours: g.invalidHours,
        needStar: g.needStar ?? 0,
        equip: g.equip && {
          part: g.equip.part,
          minLevel: g.equip.minLevel,
          suitId: g.equip.suitId,
          suitName: suit ? (entry(lang, 'suits', suit.id)?.name ?? suit.name) : null,
          essence: g.equip.essence,
          hole: g.equip.hole,
          maxHole: g.equip.maxHole,
          ranges: { ...g.equip.ranges },
          stressTable: [...g.equip.stressTable],
        },
        // 下一阶的名字直接给，Wiki 不用为一个名字拉整张道具列表（backlog #115）
        gem: g.gem && {
          level: g.gem.level,
          nextId: g.gem.nextId,
          nextName:
            g.gem.nextId === null || !config.goods.has(g.gem.nextId) ? null : nameOf(lang, g.gem.nextId),
          attrs: { ...g.gem.attrs },
        },
        gift: g.gift && g.gift.map((i) => giftItem(lang, i)).filter((x): x is OpenGiftItem => x !== null),
        sources: {
          shop: g.onSale ? { coin: g.coin, diamond: g.diamond } : null,
          renownShop: r ? { renown: r.renown, rotating: r.weekGroup !== 0 } : null,
          exchange: (madeBy.get(id) ?? []).map((x) => rule(lang, x)),
          special: specialPool.has(id),
          black: blackPool.has(id) && g.diamond > 0 ? g.diamond : null,
          award: g.awardFlag !== null,
          gemFrom: gemFrom.has(id) ? { id: gemFrom.get(id)!, name: nameOf(lang, gemFrom.get(id)!) } : null,
        },
        usedIn: (usedBy.get(id) ?? []).map((x) => rule(lang, x)),
      };
    },

    foods(lang: Locale): OpenListDto<OpenFoodBrief> {
      return { ...meta(lang), items: foodsList.map((f) => foodBrief(lang, f.id)) };
    },

    food(lang: Locale, id: number): OpenFoodDto | null {
      const f = config.foods.get(id);
      if (!f || f.retired) return null;
      const seed = seedByFood.get(id);
      return {
        ...meta(lang),
        ...foodBrief(lang, id),
        maxNum: f.maxNum,
        seed: seed ? { id: seed.id, harvestNum: seed.harvestNum } : null,
        cookbooks: [...(foodCookbooks.get(id) ?? new Map<number, number>())]
          .sort((x, y) => x[0] - y[0])
          .map(([cid, grade]) => ({
            id: cid,
            name: cookbookName(lang, cid),
            streetId: config.cookbooks.get(cid)!.streetId,
            grade,
          })),
        mysterious: (foodMc.get(id) ?? []).map((mid) => ({
          id: mid,
          name: entry(lang, 'mysterious', mid)?.name ?? config.mysterious.get(mid)?.name ?? String(mid),
        })),
      };
    },

    cookbooks(lang: Locale): OpenListDto<OpenCookbookBrief> {
      return { ...meta(lang), items: b.cookbooks.map((c) => cookbookBrief(lang, c.id)) };
    },

    cookbook(lang: Locale, id: number): OpenCookbookDto | null {
      const c = config.cookbooks.get(id);
      if (!c) return null;
      return {
        ...meta(lang),
        ...cookbookBrief(lang, id),
        taste: [...c.taste],
        // 菜谱描述没有翻译：只在简中给（问题记录 314：不在别的语言里混简中）
        desc: lang === 'zh-CN' ? c.desc : null,
        grades: Array.from({ length: 10 }, (_, i) => ({
          grade: i + 1,
          foods: (c.needFoods[i + 1] ?? []).map((f) => ({
            foodsId: f.foodsId,
            name: foodName(lang, f.foodsId),
            num: f.num,
          })),
        })),
      };
    },

    equips(lang: Locale): OpenEquipsDto {
      return {
        ...meta(lang),
        items: equipGoods.map((g): OpenEquipBrief => ({
          id: g.id,
          name: goodsName(lang, g),
          part: g.equip!.part,
          minLevel: g.equip!.minLevel,
          suitId: g.equip!.suitId,
          maxTotal: g.equip!.stressTable[g.equip!.stressTable.length - 1] ?? 0,
        })),
        suits: b.suits.map((s) => {
          const e = entry(lang, 'suits', s.id);
          return {
            id: s.id,
            name: e?.name ?? s.name,
            maxNum: s.maxNum,
            tiers: s.tiers.map((x, i) => ({ need: x.need, desc: e?.tiers?.[i] ?? x.desc })),
          };
        }),
      };
    },

    streets(lang: Locale): OpenListDto<OpenStreetDto> {
      return {
        ...meta(lang),
        items: b.streets.map((s): OpenStreetDto => {
          const e = entry(lang, 'streets', s.id);
          const medal = visible(s.medalId) ? config.goods.get(s.medalId)! : null;
          return {
            id: s.id,
            name: e?.name ?? s.name,
            cookName: e?.cookName ?? s.cookName,
            desc: e?.desc ?? s.desc,
            theme: e?.theme ?? s.theme,
            focus: s.focus,
            medal: medal && {
              id: medal.id,
              name: goodsName(lang, medal),
              desc: entry(lang, 'goods', medal.id)?.desc ?? medal.desc,
            },
            cookbookCount: cookbookCount.get(s.id) ?? 0,
          };
        }),
      };
    },
  };
}

export type OpenData = ReturnType<typeof createOpenData>;
