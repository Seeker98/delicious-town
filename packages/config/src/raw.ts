import { z } from 'zod';

const int = z.number().int();
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
export const rawCookbookPrice = z.object({ id: int, coin: z.number(), level: int, desc: z.string() });
export const rawAwardFlag = z.object({ id: int, awardflag: int });

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
  needCookbooksnum: int,
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

export const rawTask = z.object({
  id: int,
  mainflag: z.union([z.literal(0), z.literal(1)]),
  step: int,
  taskname: z.string(),
  cond: z.object({ kind: z.enum(['counter', 'state']), key: z.string(), target: int }),
  award: awardSchema,
  href: z.string(),
});

export const rawActivationTask = z.object({
  id: int,
  activationname: z.string(),
  activationvalue: int,
  limittimes: int,
  starlevel: int.nullish(),
});
export const rawActivationReward = z.object({ dictval: int, note: z.string() });

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
export const rawSeedExchange = z.object({ seedId: int }).passthrough();
export const rawFormula = z
  .object({ id: int, mainFoodsId: int, subFoodsId: int, addFoodsId: int, resFoodsId: int })
  .passthrough();
export const rawGoodsExchange = z
  .object({ id: int, goodsId: int, needGoods: z.array(z.object({ type: z.string(), id: int, num: int })) })
  .passthrough();
export const rawRenownShop = z.object({ goodsId: int }).passthrough();
export const rawBless = z
  .object({ id: int, value: z.object({ goodsId: int.optional() }).passthrough().nullable() })
  .passthrough();

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
    z.object({ key: z.string().regex(/^[a-z0-9_-]{1,32}$/), title: z.string().min(1), desc: z.string() }),
  ),
});

export const rawSuit = z.object({
  suitid: int,
  name: z.string(),
  maxnum: int,
  tiers: z.array(z.object({ neednum: int.min(1), desc: z.string(), value: z.record(z.number()) })).min(1),
});

export const rawMcProficiency = z.object({ curlevel: int, name: z.string(), expNext: int });
