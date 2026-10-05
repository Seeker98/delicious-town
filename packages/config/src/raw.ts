import { z } from 'zod';

const int = z.number().int();
/** 数量门槛：数字，或 "all" = 菜谱总数（构建时换算，问题记录 284） */
const countOrAll = z.union([z.number().int(), z.literal('all')]);
const idNum = z.object({ id: int, num: int });

export const awardSchema = z.object({
  coin: z.number().optional(),
  exp: z.number().optional(),
  diamond: z.number().optional(),
  renown: z.number().optional(),
  goods: z.array(idNum).optional(),
  foods: z.array(idNum).optional(),
});

export const rawFood = z.object({
  id: int,
  name: z.string(),
  level: int,
  coin: z.number(),
  odds: z.number(),
  maxNum: int.nullish(),
  type: int.nullish(),
});

export const rawGoods = z.object({
  id: int,
  name: z.string(),
  type: int,
  devicetype: int.nullish(),
  invalidhour: z.number().nullish(),
  maxNum: int.nullish(),
  desc: z.string().nullish(),
  value: z.string().nullish(),
  level: int.nullish(),
  coin: z.number().nullish(),
  diamond: z.number().nullish(),
  saleflag: int.nullish(),
  subflag: int.nullish(),
  awardflag: int.nullish(),
});

export const giftItemSchema = z.union([
  z.object({
    type: z.literal('goods'),
    id: int,
    num: int,
    rate: z.number(),
    level: int.optional(),
    equip: int.optional(),
  }),
  z.object({
    type: z.literal('foods'),
    num: int,
    rate: z.number(),
    flag: z.string().optional(),
    id: int.optional(),
  }),
  z.object({ type: z.enum(['coin', 'exp', 'diamond']), min: z.number(), max: z.number(), rate: z.number() }),
  z.object({ type: z.literal('renown'), num: z.number(), rate: z.number() }),
]);

export const rawCookbook = z.object({
  id: int,
  name: z.string(),
  streetId: int,
  taste: z.array(int).nullish(),
  needFoodsByLevel: z.record(z.string(), z.array(z.object({ foodsId: int, num: int }))),
});

/** 街道 → 街道勋章（问题记录 284） */
export const rawStreetMedal = z.object({ streetId: int, goodsId: int });

export const rawStreet = z.object({
  id: int,
  name: z.string(),
  cookname: z.string().nullish(),
  desc: z.string().nullish(),
});

export const rawMysterious = z.object({
  id: int,
  name: z.string(),
  level: int,
  road: int,
  nutritive: z.number().nullish(),
  coin: z.number().nullish(),
  odds: z.number().nullish(),
  taste: z.string().nullish(),
  foods: z.array(z.object({ foodsId: int, num: int })),
  appraisable: z.boolean().nullish(),
});

export const rawWeather = z.object({
  id: int,
  name: z.string(),
  daytime: int,
  type: int,
  specialflag: int,
  probability: z.number().nullish(),
  value: z.record(z.string(), z.unknown()),
  note: z.string().nullish(),
});

export const rawDevice = z.object({
  deviceid: int,
  devicename: z.string(),
  devicetype: int,
  needreststar: int,
  devicenote: z.string().nullish(),
});

export const rawStarNeed = z.object({
  starlevel: int,
  name: z.string(),
  needRestlevel: int,
  needCookbooksnum: countOrAll,
  cookbooksKind: z.enum(['learned', 'tianzhuan']),
  needCertnum: int,
  needPurpleshell: int,
});
export const rawStarAward = z.object({ starlevel: int, award: awardSchema });
export const rawOilNeed = z.object({
  oillevel: int,
  needRestlevel: int,
  needStarlevel: int,
  needCoin: z.number(),
  needGoods: z.array(idNum),
  needPurpleshell: int,
  addOilnum: int,
  oilnummax: int,
});

// 问题记录 318：章节主线、玩法支线、每周任务
const questCond = z.object({ kind: z.enum(['counter', 'state']), key: z.string(), target: countOrAll });
export const rawChapter = z.object({
  id: int,
  name: z.string(),
  needLevel: int,
  needStar: int,
  award: awardSchema,
});
export const rawQuestMain = z.object({
  id: int,
  chapter: int,
  order: int,
  name: z.string(),
  cond: questCond,
  award: awardSchema,
  href: z.string(),
});
export const rawQuestLine = z.object({
  id: int,
  key: z.string(),
  name: z.string(),
  chapter: int,
  steps: z
    .array(
      z.object({
        id: int,
        order: int,
        needStar: int.default(0),
        name: z.string(),
        cond: questCond,
        award: awardSchema,
        href: z.string(),
      }),
    )
    .min(1),
});
export const rawWeeklyGroup = z.object({
  key: z.string(),
  minStar: int,
  maxStar: int,
  fullId: int,
  fullAward: awardSchema,
  quests: z
    .array(
      z.object({
        id: int,
        name: z.string(),
        key: z.string(),
        target: int,
        award: awardSchema,
        href: z.string(),
      }),
    )
    .min(1),
});

export const rawActivationTask = z.object({
  id: int,
  activationname: z.string(),
  activationvalue: int,
  limittimes: int,
  starlevel: int.nullish(),
});
export const rawActivationReward = z.object({ dictval: int, note: z.string() });
/** 原游戏活跃度之外新增的项目和档位（问题记录 318） */
export const rawActivationExtra = z.object({
  tasks: z.array(z.object({ id: int, name: z.string(), points: int, limit: int, needStar: int })),
  rewards: z.array(z.object({ points: int, award: awardSchema })),
});

export const restaurantDefaultsSchema = z.object({
  level: int.min(1),
  attrLeft: int.min(0),
  strength: int.min(0),
  strengthMax: int.min(1),
  oil: int.min(0),
  oilMax: int.min(1),
  coin: int.min(0),
  diamond: int.min(0),
  cupboardNum: int.min(1),
  storeNum: int.min(1),
  foodsMaxNum: int.min(1),
  foodsLockNum: int.min(0),
  renown: int,
  streetId: int.min(0),
  tableNum: int.min(1),
  giftGoods: z.array(z.object({ id: int, num: int.min(1) })),
  /** 开局食材：新手街几道菜的材料和低级万能食材，让新号当天就能学菜 */
  giftFoods: z.array(z.object({ id: int, num: int.min(1) })).default([]),
});

export const rawSeed = z.object({
  id: int,
  foodsId: int,
  name: z.string(),
  foodsLevel: int,
  coin: z.number(),
  infancy: int,
  maturity: int,
  autumn: int,
  harvest: int,
  harvestnum: int,
  odds: z.number(),
});
export const rawSeedExchange = z.object({ seedId: int, seednum: int, remnantnum: int });
export const rawFormula = z.object({
  id: int,
  name: z.string(),
  mainFoodsId: int,
  subFoodsId: int,
  addFoodsId: int,
  resFoodsId: int,
  odds: z.number(),
});
export const rawIncomeAction = z.object({
  id: int,
  name: z.string(),
  coin: z.number(),
  exp: z.number(),
  landExp: int.optional(),
});
export const rawSlotAward = z.object({
  id: int,
  /** 0 空、1 食材、2 道具 */
  type: int,
  goodsId: int.nullish(),
  foodsId: int.nullish(),
  odds: int,
  rareflag: int,
  getNum: int,
  newsflag: int,
});
export const rawGoodsExchange = z.object({
  id: int,
  category: z.string(),
  goodsId: int,
  num: int.min(1),
  needGoods: z.array(z.object({ type: z.literal('goods'), id: int, num: int.min(1) })).min(1),
  times: int,
  newsflag: int,
});
export const rawRenownShop = z.object({
  goodsId: int,
  renown: int.min(1),
  rareflag: int,
  weeklyLimit: int.min(1),
  weekGroup: int.min(0).max(4),
  require: z.string().nullable(),
});
export const rawTowerFloor = z.object({
  floor: int.min(1),
  watchmanRestName: z.string(),
  watchman: z.string(),
  minlevel: int.min(1),
  challengemaxtimes: int,
  specialflag: int,
  attrSum: int,
  note: z.string().nullish(),
});
export const rawBless = z.object({
  id: int,
  name: z.string(),
  type: z.union([z.literal(0), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  num: int.min(1),
  needAct: int.min(0),
  value: z.object({ level: z.tuple([int, int]).optional(), goodsId: int.optional() }).nullable(),
  buff: z.record(z.number()),
  odds: int.min(0),
});

export const rawCookbookGrade = z.object({
  grade: int,
  name: z.string(),
  atRatePerCookbook: z.number(),
  spCoinAddRate: z.number(),
  upgradeCoin: z.number(),
  shellPerFood: int,
});

export const rawSpecialTier = z.object({
  name: z.string(),
  foodsrate: z.number(),
  num: int,
  startrate: z.number(),
  endrate: z.number(),
});

export const rawShopPool = z.object({ pool: z.enum(['special', 'black']), goods: z.array(int) });

export const rawDictTier = z.object({ dictname: z.string(), dictval: int, note: z.string() });

export const rawGuessFood = z.object({ i: int, l: int, n: z.string(), o: z.number() });

export const guessAwardFile = z.object({
  byHits: z.array(z.object({ hits: int.min(1), award: awardSchema })),
  bonus: z.array(z.object({ minHits: int.min(1), award: awardSchema })),
});

export const actionMapFile = z.object({
  activation: z.record(z.string(), z.string()),
  features: z.record(z.string(), z.string()),
});

const mmdd = z.string().regex(/^\d{2}-\d{2}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const holidaysFile = z.object({
  solarMultiplier: int,
  lunarMultiplier: int,
  solar: z.record(mmdd, z.string()),
  qingming: z.record(z.string().regex(/^\d{4}$/), mmdd),
  lunar: z.record(ymd, z.string()),
});

export const looksFile = z.object({
  doors: z.array(z.object({ id: int.min(0), name: z.string().min(1), coin: int.min(0) })).min(1),
  avatars: z.array(z.object({ id: int.min(1), name: z.string().min(1) })).min(1),
  icons: z.array(
    z.object({
      key: z.string().regex(/^[a-z0-9_-]{1,32}$/),
      title: z.string().min(1),
      desc: z.string(),
      /** 称号商店（240-2）：限时上架，按游戏日期 [from, to) 能用银币买；不写的只能靠活动、一番赏、后台发放 */
      shop: z
        .object({
          coin: int.min(1),
          from: ymd,
          to: ymd,
        })
        .strict()
        .optional(),
    }),
  ),
});

export const rawSuit = z.object({
  suitid: int,
  name: z.string(),
  maxnum: int,
  tiers: z.array(z.object({ neednum: int.min(1), desc: z.string(), value: z.record(z.number()) })).min(1),
});

export const rawMcProficiency = z.object({ curlevel: int, name: z.string(), expNext: int });

/** data/game/setting_docs.json：区服数值说明（问题记录 126）；手写，构建时和数值树交叉检查 */
export const settingDocsFile = z
  .object({ features: z.record(z.string()), groups: z.record(z.string()), fields: z.record(z.string()) })
  .strict();

/** data/game/newbie_codes.json：新手兑换码（问题记录 150）；细校验在 checkNewbieCodes，错误信息能带上码 */
export const newbieCodesFile = z
  .object({
    codes: z.array(
      z.object({ code: z.string(), minLevel: int.min(1), items: z.unknown(), note: z.string() }).strict(),
    ),
  })
  .strict();

/** data/game/souvenirs.json：纪念品（148-2 设计 §6） */
/** data/game/newbie_pack.json：新手大礼包的内容（问题记录 331）；食材随机券的定义在主表 */
export const newbiePackFile = z
  .object({
    rule: z.string(),
    pack: z.object({ goodsId: int.min(1), gift: z.array(giftItemSchema).min(1) }).strict(),
  })
  .strict();

/** data/game/kuji.json：一番赏的月度主题和豪华池称号；抽赏券、手办的定义在主表（重新编号 PR 1） */
export const kujiFile = z
  .object({
    /** 豪华池按月轮换的称号（240-2）：年月 → 档位 key（或 last）→ 称号 */
    deluxeMonths: z.array(
      // 月份只能 01~12：写成 2026-13 那一项永远对不上（质量期 ②）
      z
        .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), icons: z.record(z.string().min(1)) })
        .strict(),
    ),
    /** 月度主题（问题记录 274）：每月 A/B/C/最后赏 4 个限定手办 */
    themes: z.array(
      z
        .object({
          month: int.min(1).max(12),
          name: z.string().min(1),
          desc: z.string().min(1),
          /** 手办的道具编号 */
          figures: z.object({ A: int, B: int, C: int, last: int }).strict(),
        })
        .strict(),
    ),
  })
  .strict();

/** data/game/retired.json：下架的道具、食材（问题记录 367）；道具整理工具写入，name 只是方便看 diff */
const retiredItem = z.object({ id: int, name: z.string().optional(), note: z.string().optional() }).strict();
export const retiredFile = z.object({ goods: z.array(retiredItem), foods: z.array(retiredItem) }).strict();

/**
 * data/game/food_supply.json：食材出现权重向需求靠的比例（问题记录 50）。
 * 不能取 1：没有需求的食材权重变 0、被剔出池子，某级稀有池可能变空（质量期 ②）
 */
export const foodSupplyFile = z.object({ demandBlend: z.number().min(0).lt(1) }).strict();

/** data/game/fund.json：小镇发展基金的勋章（240-2） */
export const fundFile = z
  .object({
    medals: z.array(
      // 名字、说明、时长、加成在主表（重新编号 PR 1）
      z
        .object({
          id: int.min(1),
          /** 领取时一起发的限时称号（looks.icons 的 key），和勋章同时到期 */
          icon: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

/** data/game/tower_fix.json：守塔人厨力和换层（问题记录 120）；数据集会被同步覆盖，所以单独放 */
export const towerFixFile = z.object({
  floors: z.array(
    z
      .object({
        floor: int.min(1),
        power: int.min(1),
        watchmanRestName: z.string().min(1).optional(),
        watchman: z.string().min(1).optional(),
        note: z.string().optional(),
      })
      .strict(),
  ),
});

/** 强化数值表（问题记录 120）：单件厨具 +0~+10 的属性总和；按套装或道具 id 覆盖，可带穿戴等级 */
export const stressTableEntry = z
  .object({
    name: z.string().min(1),
    suits: z.array(int).optional(),
    goods: z.array(int).optional(),
    minLevel: int.min(0).optional(),
    values: z.array(int),
  })
  .strict();
export type StressTableEntry = z.infer<typeof stressTableEntry>;

/** data/game/equip_lore.json：厨具改名（带背景故事）、新增厨具、替换或新增套装；手写文件，多写的键报错（终审 I3） */
export const equipLoreFile = z.object({
  suits: z.array(rawSuit.strict()),
  stressTables: z.array(stressTableEntry),
});

/** 主表（重新编号 PR 1）：道具、食材、菜谱的定义只在 data/master 下；src = 来历，新街道导入按它整块替换 */
const goodsSrc = z.enum(['original', 'lore', 'streets', 'souvenir', 'kuji', 'newbie', 'fund', 'poster']);
export const masterGoods = z
  .object({
    id: int,
    src: goodsSrc,
    name: z.string().min(1),
    type: int,
    deviceType: int.nullable(),
    invalidHours: z.number().nullable(),
    maxNum: int,
    stackable: z.boolean(),
    level: int,
    coin: z.number(),
    diamond: z.number(),
    onSale: z.boolean(),
    awardFlag: int.nullable(),
    desc: z.string(),
    value: z.unknown(),
    /** 后期海报奖杯（问题记录 146） */
    needStar: int.optional(),
    /** 一到五级食材随机券（问题记录 331）：value 是空的，用法直接写 */
    use: z
      .object({ kind: z.literal('randomFood'), level: int.min(1).max(7) })
      .strict()
      .optional(),
  })
  .strict();
export const masterFood = z
  .object({
    id: int,
    src: z.enum(['original', 'streets']),
    name: z.string().min(1),
    level: int,
    coin: z.number(),
    odds: z.number(),
    maxNum: int,
    type: int.nullable(),
  })
  .strict();
export const masterCookbook = z
  .object({
    id: int,
    src: z.enum(['original', 'streets']),
    name: z.string().min(1),
    streetId: int,
    taste: z.array(int),
    coin: z.number(),
    level: int,
    desc: z.string(),
    needFoods: z.record(z.string(), z.array(z.object({ foodsId: int, num: int }).strict())),
  })
  .strict();
