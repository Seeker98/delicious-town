import { dishCoin, fairFoodPrice, foodPrice } from '../../core/prices';
import { starNeedOf } from '../growth/rules';
import { LEARN_REMNANTS } from '../mysterious/rules';
import {
  WIKI_HIDDEN_GOODS,
  type GameConfig,
  type GiftItem,
  type Goods,
  type GoodsExchange,
  type I18nEntry,
  type I18nKind,
  type MysteriousCookbook,
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
  type OpenMysteriousBrief,
  type OpenMysteriousDto,
  type OpenMysteriousListDto,
  type OpenMysteriousRoad,
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
  '/api/v1/open/mysterious',
  '/api/v1/open/mysterious/:id',
  '/api/v1/open/equips',
  '/api/v1/open/streets',
];

/** 资料库不列的食材等级（2026-10-24）：6 级没有获取渠道 */
const HIDDEN_FOOD_LEVELS: ReadonlySet<number> = new Set([6]);

/**
 * 开放接口的数据（问题记录 142，设计 §2）：全部从配置包算，不读数据库。
 * 反向索引（食材 → 菜谱、特色菜；道具 → 兑换）建一次；名字按语言从配置包的翻译表取
 */
export function createOpenData(config: GameConfig) {
  const b = config.bundle;
  const hidden = WIKI_HIDDEN_GOODS;
  // 下架的道具、食材（问题记录 367）和后台专用的一样不显示
  const visible = (id: number) => !hidden.has(id) && config.goods.has(id) && !config.goods.get(id)!.retired;
  const goodsList = b.goods.filter((g) => visible(g.id));
  // 没开放的不上资料库（2026-10-24）：品级只到 cookbookMaxGrade；6 级食材游戏里没有渠道（随机食材最高 5 级），只给天馔用
  const maxGrade = b.tuning.rest.cookbookMaxGrade;
  const foodVisible = (f: { level: number; retired?: boolean }) =>
    !f.retired && !HIDDEN_FOOD_LEVELS.has(f.level);
  const foodsList = b.foods.filter(foodVisible);
  const equipGoods = goodsList.filter((g) => g.equip !== null);

  /** 食材 → 用到它的菜谱（同一道菜只记最低品级） */
  const foodCookbooks = new Map<number, Map<number, number>>();
  for (const c of b.cookbooks)
    for (let grade = 1; grade <= maxGrade; grade++)
      for (const f of c.needFoods[grade] ?? []) {
        let m = foodCookbooks.get(f.foodsId);
        if (!m) foodCookbooks.set(f.foodsId, (m = new Map()));
        if (!m.has(c.id)) m.set(c.id, grade);
      }
  const foodMc = new Map<number, number[]>();
  for (const mc of b.mysteriousCookbooks)
    for (const f of new Set(mc.foods)) foodMc.set(f, [...(foodMc.get(f) ?? []), mc.id]);
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
  // 当令表（资料库特色菜 2026-10-17）：按默认配置；特殊天气一道到六道全部当令，单独列
  const shilingRoads = new Map(b.tuning.shiling.roads);
  const specialWeathers = b.weather.filter((w) => w.special && shilingRoads.has(w.id));
  const roadWeathers = (road: number) =>
    b.weather.filter((w) => !w.special && (shilingRoads.get(w.id) ?? []).includes(road));
  // 鉴定道具：按等级范围对上特色菜
  const appraisers = [...config.appraiseTools].filter(([id]) => visible(id));
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
  const streetBrief = (lang: Locale, id: number) => ({
    name: entry(lang, 'streets', id)?.name ?? config.streets.get(id)?.name ?? '',
    cookbooks: cookbookCount.get(id) ?? 0,
  });
  /** 玩法攻略里的数（backlog 384）：默认配置（不看区服覆盖，Wiki 不分区服）；菜最多的街取编号最小的那条 */
  const guideNumbers = (lang: Locale): OpenGuideNumbers => {
    const t = b.tuning;
    const top = b.streets.reduce((x, y) =>
      (cookbookCount.get(y.id) ?? 0) > (cookbookCount.get(x.id) ?? 0) ? y : x,
    );
    return {
      startStreet: streetBrief(lang, b.restaurantDefaults.streetId),
      star2Cookbooks: starNeedOf(config.starNeed, t.growth, 2)?.needCookbooks ?? 0,
      biggestStreet: streetBrief(lang, top.id),
      takeaway: {
        star: t.takeaway.openStar,
        renown: t.takeaway.openRenown,
        coin: t.takeaway.openCoin,
        diamond: t.takeaway.openDiamond,
      },
      exchange: { level: t.exchange.minLevel, days: t.exchange.minAccountDays },
      predict: { level: t.predict.minLevel, days: t.predict.minAccountDays },
      newbieExp: { maxLevel: t.settlement.newbieExp.maxLevel, rate: t.settlement.newbieExp.rate },
      acquire: {
        minStar: t.acquire.minStar,
        priceDays: t.acquire.priceDays,
        buyerMinStar: t.acquire.buyerMinStar,
        buyerMinAccountDays: t.acquire.buyerMinAccountDays,
        maxHoldings: t.acquire.maxHoldings,
        priceMultiple: t.acquire.priceMultiple,
        taxRate: t.acquire.taxRate,
        firstStoreRate: t.acquire.firstStoreRate,
        firstBurnRate: t.acquire.firstBurnRate,
        resaleStoreRate: t.acquire.resaleStoreRate,
        redeemBurnRate: t.acquire.redeemBurnRate,
        cedeRate: t.acquire.cedeRate,
        cedeTendRate: t.acquire.cedeTendRate,
        tendMultiplier: t.acquire.tendMultiplier,
        tendCostRate: t.acquire.tendCostRate,
        tendReleaseDays: t.acquire.tendReleaseDays,
        protectDays: t.acquire.protectDays,
      },
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
      coin: foodPrice(f, config.tuning.market),
      fairCoin: fairFoodPrice(f, config.tuning.market),
      rare: f.odds < 100,
      type: f.type,
    };
  };
  /** 主料：普通品级的第一样食材 */
  const mainFood = (id: number): number | null =>
    config.cookbooks.get(id)?.needFoods[1]?.[0]?.foodsId ?? null;
  const cookbookBrief = (lang: Locale, id: number): OpenCookbookBrief => {
    const c = config.cookbooks.get(id)!;
    return {
      id: c.id,
      name: cookbookName(lang, c.id),
      streetId: c.streetId,
      level: c.level,
      coin: dishCoin(c.coin, config.tuning.settlement.dishCoinRate),
      mainFoodId: mainFood(c.id),
    };
  };

  const mcName = (lang: Locale, id: number) =>
    entry(lang, 'mysterious', id)?.name ?? config.mysterious.get(id)?.name ?? String(id);
  const weatherBrief = (lang: Locale, w: { id: number; name: string }) => ({
    id: w.id,
    name: entry(lang, 'weather', w.id)?.name ?? w.name,
  });
  const mcBrief = (lang: Locale, m: MysteriousCookbook): OpenMysteriousBrief => ({
    id: m.id,
    name: mcName(lang, m.id),
    level: m.level,
    road: m.road,
    nutritive: m.nutritive,
    mainFoodId: m.foods[0] ?? null,
  });
  const mcRoads = [...new Set(b.mysteriousCookbooks.map((m) => m.road))].sort((x, y) => x - y);

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
          mysterious: b.mysteriousCookbooks.length,
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
      if (!f || !foodVisible(f)) return null;
      return {
        ...meta(lang),
        ...foodBrief(lang, id),
        maxNum: f.maxNum,
        cookbooks: [...(foodCookbooks.get(id) ?? new Map<number, number>())]
          .sort((x, y) => x[0] - y[0])
          .map(([cid, grade]) => ({
            id: cid,
            name: cookbookName(lang, cid),
            streetId: config.cookbooks.get(cid)!.streetId,
            grade,
            mainFoodId: mainFood(cid),
          })),
        mysterious: (foodMc.get(id) ?? []).map((mid) => ({ id: mid, name: mcName(lang, mid) })),
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
        // 菜谱描述没有英法西翻译：简中给原文、繁中给构建时转换的（#115），别的语言为空（问题记录 314：不混简中）
        desc: lang === 'zh-CN' ? c.desc : (entry(lang, 'cookbooks', id)?.desc ?? null),
        grades: Array.from({ length: maxGrade }, (_, i) => ({
          grade: i + 1,
          foods: (c.needFoods[i + 1] ?? []).map((f) => ({
            foodsId: f.foodsId,
            name: foodName(lang, f.foodsId),
            num: f.num,
          })),
        })),
      };
    },

    mysterious(lang: Locale): OpenMysteriousListDto {
      const m = b.tuning.mysterious;
      return {
        ...meta(lang),
        items: b.mysteriousCookbooks.map((x) => mcBrief(lang, x)),
        roads: mcRoads.map((road): OpenMysteriousRoad => ({
          road,
          weathers: roadWeathers(road).map((w) => weatherBrief(lang, w)),
        })),
        special: specialWeathers.map((w) => weatherBrief(lang, w)),
        rules: {
          remnants: LEARN_REMNANTS,
          shilingMinStar: b.tuning.shiling.minStar,
          same: m.roadSame,
          sameMax: m.roadSameMax,
          other: m.roadOther,
          otherMax: m.roadOtherMax,
        },
      };
    },

    /** 残卷来源和时令铺的规则同游戏（shiling/service shopPools）：可鉴定的 1~5 级是残卷，其余是珍稀残卷 */
    mysteriousDetail(lang: Locale, id: number): OpenMysteriousDto | null {
      const m = config.mysterious.get(id);
      if (!m) return null;
      const shop = b.tuning.shiling.shop;
      const rare = !m.appraisable || m.level >= 6;
      return {
        ...meta(lang),
        ...mcBrief(lang, m),
        taste: [...m.taste],
        coin: m.coin,
        saleRate: b.tuning.mysterious.saleRates[m.level - 1] ?? 1,
        foods: [...new Set(m.foods)].map((f) => ({ id: f, name: foodName(lang, f) })),
        inSeason: roadWeathers(m.road).map((w) => weatherBrief(lang, w)),
        sources: {
          appraise: m.appraisable
            ? appraisers
                .filter(([, a]) => m.level >= a.min && m.level <= a.max)
                .map(([gid, a]) => ({
                  id: gid,
                  name: nameOf(lang, gid),
                  rate: a.rate,
                  min: a.min,
                  max: a.max,
                }))
            : [],
          fragments: m.appraisable ? b.tuning.mysterious.fragmentPerRemnant : null,
          shilingShop: rare
            ? { rare: true, price: shop.rarePrice, weekly: shop.rareWeekly }
            : { rare: false, price: shop.remnantPerLevel * m.level, weekly: shop.remnantWeekly },
        },
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
