import { DUEL_JUDGES } from '@dt/shared';
import { z } from 'zod';

const num = z.number();

/** 随机奖励的类型比例：四项不为负、加起来不超过 1，抽不中的算食材（backlog 352） */
const awardRates = z
  .object({ foods: num.min(0), goods: num.min(0), coin: num.min(0), exp: num.min(0) })
  .refine((r) => r.foods + r.goods + r.coin + r.exp <= 1 + 1e-9, 'rates must sum to at most 1');
const int = z.number().int();
/** 奖励（邀请等配置里用）：和后台补偿同样的五项 */
const idNum = z.object({ id: int, num: int.min(1) });
const range = z.tuple([int.min(1), int.min(1)]).refine(([lo, hi]) => lo <= hi, 'min must be <= max');
/** 最后一颗糖的一张桌子（问题记录 427-1）：糖果数下限要大于每次最多拿的上限，免得一开局就能一把拿完 */
const nimTable = z
  .object({
    cost: int.min(0),
    k: range,
    pile: range,
    mistake: num.min(0).max(1),
    first: z.enum(['choose', 'coin']),
    renown: int.min(0),
    awardLevel: int.min(1),
  })
  .refine((x) => x.pile[0] > x.k[1], 'pile min must be greater than k max');
const rewardSchema = z.object({
  coin: int.min(1).optional(),
  diamond: int.min(1).optional(),
  exp: int.min(1).optional(),
  goods: z.array(idNum).optional(),
  foods: z.array(idNum).optional(),
});
/** 一番赏的奖品（和活动奖励同样的六项） */
const kujiAward = z.object({
  coin: int.min(1).optional(),
  exp: int.min(1).optional(),
  diamond: int.min(1).optional(),
  renown: int.min(1).optional(),
  goods: z.array(idNum).optional(),
  foods: z.array(idNum).optional(),
});
const kujiNews = z.enum(['broadcast', 'news']).optional();
const levelWeights = z.array(z.tuple([int, num])).min(1);
/** 一番赏一条线的档位和最后赏（普通池、豪华池共用） */
const kujiTiers = z
  .array(
    z.object({
      key: z.string().min(1).max(4),
      count: int.min(1),
      award: kujiAward,
      icon: z.string().min(1).optional(),
      news: kujiNews,
    }),
  )
  .min(1);
const kujiLast = z.object({ award: kujiAward, icon: z.string().min(1).optional(), news: kujiNews });

/** 数值常量（data/game/tuning.json）。区服可以通过 shard_config.override.tuning 覆盖任意字段 */
export const tuningSchema = z.object({
  rest: z.object({
    atRateBase: num,
    atRatePerStar: num,
    spRateBase: num,
    spRatePerStar: num,
    localRateBase: num,
    localRatePerStar: num,
    oilBase: num,
    coinBase: num,
    /** 普通顾客基础价每星加多少（收益模型改版 2026-10-15）：没学会点的菜时付 coinBase + 它 × 星级 */
    normalCoinPerStar: num.min(0),
    expBase: num,
    handleRateBase: num,
    handleRatePerStar: num,
    tablesPerFloor: int.min(1),
    attrPerLevel: int,
    luckPerLevel: int,
    tablesPerLevel: int,
    cookbookMaxGrade: int.min(1).max(10),
  }),
  settlement: z.object({
    atFloatBase: num,
    atFloatPerStar: num,
    spFloatPerStar: num,
    spFloatCenter: num,
    atOverflowThreshold: num,
    atOverflowDivisor: num,
    /** 挑剔率软上限（挑剔顾客调整 2026-10-12）：截到 0~1 之后，超过 spSoftCapAt 的部分乘 spSoftCapRate */
    spSoftCapAt: z.number().min(0).max(1),
    spSoftCapRate: z.number().min(0).max(1),
    /** 上座率软上限（街道再平衡第二版 2026-10-14）：超过 atSoftCapAt 的部分乘 atSoftCapRate，再截到 0~1；溢出经验仍按折算前算 */
    atSoftCapAt: z.number().min(0),
    atSoftCapRate: z.number().min(0).max(1),
    /** 菜谱带来的上座率乘这个倍数（同上，默认 0.5） */
    cookbookAtRate: z.number().min(0),
    negativeRenownAtRate: num,
    starPotential: z.array(num),
    // 低等级经验加成（问题记录 378）：1 级 +rate，线性减到 maxLevel 为 0
    newbieExp: z.object({ maxLevel: int.min(2), rate: num.min(0) }),
    planktonRateBase: num,
    planktonRatePerStar: num,
    planktonMultiplier: num,
    /** 赶走痞老板的店多少小时内不再被选为驻留店（原版没有；小区服里总是同一家） */
    planktonHostCooldownHours: num,
    /** 全服经营经验倍率：每桌经验和挑剔消耗食材经验都乘它（原作为 1） */
    expMultiplier: z.number().positive(),
    /** 全服银币倍率：每桌付费顾客的银币乘它（148-4 全服加成用，默认 1） */
    coinMultiplier: z.number().positive(),
    /** 菜价倍率（问题记录 240-1）：挑剔顾客、蟹老板按菜价付钱和外卖单价都乘它 */
    dishCoinRate: z.number().positive(),
    /** 普通顾客按菜价付的比例（收益模型改版 2026-10-15）：点到本街学会的菜付 菜价 × 它 × (1 + 普通品级加成) */
    normalDishRate: z.number().min(0),
    /** 普通顾客按菜价付的上限（不含加成）；不超过最便宜的菜满意挑剔顾客付的钱 */
    normalCoinCap: z.number().min(0),
    /** 学菜加挑剔率（收益模型改版 2026-10-15）：本街学满时加多少，按本街学会的道数比例 */
    spLearnRate: z.number().min(0),
    roachRateBase: num,
    roachRatePerStar: num,
    /** 一家店同时最多多少比例的桌子是蟑螂桌（向上取整，至少 1 张）；自然长的和好友放的合计（问题记录 228） */
    roachMaxShare: z.number().min(0).max(1),
    /** 别人放的蟑螂最多待几小时，到了结算时跑掉（问题记录 457） */
    roachForeignHours: z.number().min(0),
    squidwardRate: num,
    squidwardMinStar: int,
    squidwardOtherStreetFactor: num,
    squidwardPortions: int,
    krabRate: num,
    krabSameStreetFactor: num,
    krabLuckDivisor: num,
    krabMaxGrade: int,
    krabExpPerGrade: num,
    krabCoinMultiplier: num,
    pickyMaxGrade: int,
    /** 本街学会几道菜时挑剔顾客一定点到会做的；不到时按 学会数 ÷ 它 的机会点到，否则点到没学会的走人 */
    pickyHitCount: int.min(1),
    /** 品级不够时付这道菜挑剔价的几成 */
    pickyShortPayRate: z.number().min(0).max(1),
    /** 普通顾客里吃特色菜的桌数比例：每轮从普通顾客桌里随机挑 ⌊桌数 × 它⌋ 桌各吃 1 份（特色菜卖法 2026-10-13；1 = 每桌都吃） */
    normalSpecialShare: z.number().min(0).max(1),
    /** 普通顾客每份特色菜付每份价值的几成（原来固定半价） */
    normalSpecialPriceRate: z.number().min(0).max(1),
    cookfoodsPerFlag: int,
    cookfoodsMaxFlag: int,
    cookfoodsMinGrade: int,
    cookfoodsNeedGradeCap: int,
    dtTicketBaseRate: num,
    dtTicketLuckDivisor: num,
    dtTicketOddsDivisor: num,
    krabCoinBaseRate: num,
    krabCoinOddThreshold: num,
    krabCoinOddStep: num,
    renownRate: num,
    renownOddThreshold: num,
    concurrency: int.min(1),
    batchSize: int.min(1),
  }),
  collection: z.object({
    plaquePer: num,
    honorPer: num,
  }),
  strength: z.object({
    regen: int,
    luckyRegen: int,
    /** 开饭领体力（用户 2026-10-19）：每天这几个时段 [from, to) 点（游戏时间）各领一次，可以超过上限、错过不补 */
    meals: z
      .array(
        z.object({
          key: z.enum(['lunch', 'dinner']),
          from: int.min(0).max(23),
          to: int.min(1).max(24),
          amount: int.min(1),
        }),
      )
      .refine((ms) => ms.every((m, i) => m.from < m.to && (i === 0 || ms[i - 1]!.to <= m.from)), {
        message: 'meals must be ordered, non-overlapping, from < to',
      })
      .default([]),
  }),
  mouse: z.object({
    rateBase: num,
    ratePerStar: num,
    newbieFactor: num,
    luckDivisor: num,
    trapCoinPerLevel: num,
  }),
  growth: z.object({
    plaque2Star: int,
    plaque2Coin: int,
    plaque2Diamond: int,
    cookfoodsMinStar: int,
    drivePlanktonStrength: int,
    drivePlanktonRenownPerSqrt: int,
    drivePlanktonExpPerRenown: int,
    drivePlanktonBookExpPerRenown: int,
    renameCoinPerRoach: int,
    renameMaxLength: int,
    /** 升到第 N 星付的银币，第 N 个数；没写的星不收（问题记录 240-1） */
    starCoin: z.array(int.min(0)),
    /** 搬街费 ×（1 + 星级 × 这个值）（问题记录 240-1） */
    moveStarRate: num.min(0),
  }),
  cupboard: z.object({
    handleMax: int.min(1),
    freeHandleBase: int,
    freeHandlePerStar: int,
    thawCoinRate: num,
    failCoinRate: num,
    /** 请求体另有上限 50（shared exchangeBody） */
    exchangeMaxTimes: int.min(1).max(50),
  }),
  market: z.object({
    dailyHours: z.array(int).min(1),
    dailyKinds: int,
    dailyKindsLastHour: int,
    dailyKindsLast: int,
    // 日常货架每轮另加几种新手街缺的食材（问题记录 378 N3），0 = 不加
    dailyNewbieKinds: int.min(0),
    dailyStock: int,
    dailyRareStock: int,
    dailyLevelWeights: levelWeights,
    specialHours: z.array(int).min(1),
    specialKinds: int,
    specialHotChance: num,
    specialStockBase: int,
    specialStockRand: int,
    /** 特价货架单价（银币）：specialPrices 里没写的等级按它（公允价阶梯 2026-10-15：2 级热门位仍是 2,999） */
    specialPrice: int,
    /** 特价货架按食材等级定价（[等级, 银币] 列表），没写的等级按 specialPrice（公允价阶梯 2026-10-15） */
    specialPrices: z.array(z.tuple([int, int.min(1)])).default([]),
    specialLevelWeights: levelWeights,
    premiumHours: z.array(int).min(1),
    premiumKinds: int,
    premiumStock: int,
    premiumRareFactor: num,
    premiumLevel: int,
    premiumPriceFactor: num,
    /** 菜场价格倍率：三个货架的单价在天气系数之后再乘它（148-4 全服加成用，默认 1） */
    priceFactor: z.number().positive(),
    /** 各等级食材的价格倍数，第 N 个是 N 级；没写的等级按 1（问题记录 240-1） */
    levelPriceRate: z.array(z.number().positive()),
    /**
     * 公允价阶梯（2026-10-15）：交易所参考价和带、系统做市、期货单价、大宗起拍和底价按它，第 N 个是 N 级，没写的按 1。
     * 菜场价（levelPriceRate）只管菜场日常、高级货架和时令每份点数（合成失败退款、解冻费按基价，两套都不用）；以后新加食材渠道先定用哪个
     */
    fairPriceRate: z.array(z.number().positive()),
    shelfLimits: z.tuple([int, int, int]),
    rareWindowMinutes: int,
    rareLimitOddsFactor: num,
    rareLimitBase: int,
    specialIpCooldownSec: int,
    hotMinNeedCount: int,
    guessCost: int,
    guessMaxPick: int.min(1),
    guessBonusHours: z.array(int),
    manualCost: int.min(0),
    manualKinds: int.min(1),
    manualStock: int.min(1),
    manualPersonMax: int.min(1),
    manualShare: num.min(0).max(1),
  }),
  shop: z.object({
    sellRate: num,
    specialHour: int,
    specialFallbackGoods: int,
    discardable: z.array(int),
    /** 不能卖回商店的道具（用户 2026-10-08 定：蟹币。100 张神秘礼券换 1 个蟹币，原来能卖 35 万银币） */
    noSell: z.array(int).default([]),
    /** 有钻石价的道具卖店价不超过 钻石价 × 这个数（经济分析 2026-10-08：一番赏的钻石买鞋带卖店） */
    diamondSellCoin: int.min(1),
    maxBuy: int.min(1),
    /** 每人每天限买几个：[道具, 个数]（天气改版：晴雨签每天 1 个） */
    dailyLimit: z.array(z.tuple([int, int.min(1)])).default([]),
    /** 每周限购（道具价格迁移 2026-10-15）：[道具 id, 个数]，按游戏周（周一起）计，银币店和黑市共用 */
    weeklyLimit: z.array(z.tuple([int, int.min(1)])).default([]),
  }),
  store: z.object({ maxBatch: int.min(1) }),
  world: z.object({
    weatherHours: z.array(int).min(1),
    nightFrom: int,
    nightTo: int,
    krabHour: int,
    krabStreetMin: int,
    krabStreetMax: int,
    nightWeatherOdds: z.array(z.tuple([int, num])),
    dayWeightScale: num,
    /** 司天罗盘、晴雨签（天气改版设计 §2）：每人冷却、盖多久、签多久不选按第一支 */
    tool: z.object({ cooldownHours: num.min(0), coverMinutes: int.min(1), lotsSec: int.min(1) }),
  }),
  friend: z.object({
    requireVerifiedEmail: z.boolean(),
    maxFriends: int.min(1),
    dine: z.object({
      minMinutes: int.min(0),
      strengthPerHour: int,
      strengthMax: int,
      baseSeats: int.min(0),
      hostAwardLevel: int.min(1),
    }),
    roach: z.object({
      layBase: int,
      layLevelRate: num,
      layCoin: int,
      layExp: int,
      killCoin: int,
      killExp: int,
      killCoinLevelRate: num,
      killSelfRate: num,
      killStrength: z.object({ self: int, friend: int, npc: int }),
      ticketRate: num,
      ticketMax: int.min(1),
      killPerHostDaily: int.min(0),
    }),
    flip: z.object({
      baseSlots: int.min(1),
      slotsPerStar: int,
      coolHours: num,
      coolRandHours: num,
      npcCoolHours: num,
      cheapTimes: int,
      perHostDaily: int.min(0),
      caughtCoinPerLevel: int,
      npcCaughtCoinPerStar: int,
      hitRate: num,
      handleFoodsRate: num,
      handleFoodsRatePerStar: num,
      luckDivisor: z.number().positive(),
    }),
    exchange: z.object({
      maxLevel: int,
      feeRate: num,
      lockedFeeMul: num,
      /** 每天和所有好友加起来能换几次（问题记录 479，不看星级） */
      perDay: int.min(1),
      /** 每天最多被别人换走几次（问题记录 479） */
      takenPerDay: int.min(1),
      npcBase: int,
      /** 蟹老板次数 = npcBase − 星级，最少这么多（星级能到 12，以前会变成负数） */
      npcMin: int.min(0),
      stormCaughtRate: num,
      bangleBase: num,
      bangleFactor: num,
    }),
    thumbs: z.object({ rewardTimes: int, ticketMax: int, overRenown: int, strengthMax: int.min(1) }),
    refuel: z.object({ bigTank: int.min(2), drawsPerChunk: int }),
    npc: z.object({
      name: z.string().min(1),
      level: int.min(1),
      star: int.min(0),
      tables: int.min(1),
      oil: int.min(1),
      avatar: int,
      door: int,
      roachRate: num,
      // 橱柜（问题记录 370）：1~5 级食材各补到 [最少, 最多] 之间的随机数，下标 = 等级 - 1；稀有食材按 odds 打折
      restockRanges: z
        .array(z.tuple([int.min(1), int.min(1)]).refine(([lo, hi]) => lo <= hi, 'min must be <= max'))
        .length(5),
    }),
  }),
  equip: z.object({
    /**
     * 穿戴厨具（含宝石）对收益的加成（问题记录 411）：加权点数 = Σ 属性 × weights（幸运不算），
     * 最终银币 + 点数 × coinRate，最终经验 + 点数 × expRate，特色菜金牌 + 点数 × mcGoldRate
     */
    income: z.object({
      weights: z.object({
        cook: num.min(0),
        cutting: num.min(0),
        fire: num.min(0),
        season: num.min(0),
        creatives: num.min(0),
      }),
      coinRate: num.min(0),
      expRate: num.min(0),
      mcGoldRate: num.min(0),
    }),
    maxStress: int.min(1),
    baseRate: num,
    ratePerStress: num,
    /** 连续失败每次加的成功率（保底） */
    floorPerFail: num,
    coinPerEssence: int,
    /** 强化到这一级起发新闻 */
    newsFromStress: int,
    gemBaseRate: num,
    gemRatePerLevel: num,
    gemExpPerLevel: int,
    /** 升阶成功得到的宝石阶数大于它时发新闻 */
    gemNewsLevel: int,
    /** 下一阶不小于它且有失败时发新闻 */
    gemBrokenNewsLevel: int,
    ungemCoinPerLevel: int,
    /** 从这个星级起摘除宝石要花银币 */
    ungemMinStar: int,
    maxPresets: int.min(1),
    historyLimit: int.min(1),
  }),
  mysterious: z.object({
    /** 特色菜卖给顾客时每份价值的倍率，按特色菜等级（第 1 项是 1 级；没写的等级 ×1）；只在结算卖出时乘，赛厨等其他地方用原价（问题记录 412） */
    saleRates: z.array(num.min(0)),
    /** 几张同级残卷碎片换 1 张这一级任选一道的残卷（问题记录 415） */
    fragmentPerRemnant: int.min(1),
    cookNums: z.array(int.min(1)).min(1),
    baseNum: int,
    /** 等级大于它的特色菜份数打折 */
    highLevel: int,
    highLevelNumRange: z.tuple([num, num]),
    /** 品级 2~7 的下限（规格书 04 §4.5 mcGradeRate） */
    gradeBounds: z.array(num).length(6),
    /** 品级 1~7 的份数系数区间（mcGradeRatio） */
    gradeRatio: z.array(z.tuple([num, num])).length(7),
    levelBonusPerLevel: num,
    roadSame: num,
    roadSameMax: num,
    roadOther: num,
    roadOtherMax: num,
    cookNumPowerDiv: num,
    bobRatePerNutritive: num,
    tasteDaily: int.min(1),
    tasteAwardMax: int,
    tasteMcRate: num,
    tasteGradeFactor: num,
    lessonLearnRate: num,
    lessonStealRate: num,
    lessonStealPerLevel: num,
    learnStrength: int,
    stealStrength: int,
    tuitionTimes: num,
    teacherShare: num,
    learnFragments: int,
    teacherFragments: int,
    forgetPerLevel: int.min(0),
    /** 偷学失败时被抽中的食谱各降几品，降到 0 就是忘了（问题记录 424） */
    forgetGrades: int.min(1),
    forgetMcFromLevel: int,
    forgetMcPerLevel: num,
    forceCloseCoinPerLevel: int,
    championHour: int.min(0).max(23),
    /** 昨日特色菜榜前几名得到的道具（2026-10-19 起是美味印章） */
    championGoodsId: int,
    /** 按名次给几个：第 1 项是第 1 名，名次超出长度的不给（2026-10-19：第 1 名 2 个、第 2~4 名各 1 个） */
    championNums: z.array(int.min(1)).min(1),
  }),
  temple: z.object({
    guardianHpBase: int,
    guardianHpPerStar: int,
    missileTicketRate: num,
    missileMapRate: num,
    guardianRareRate: num,
    guardianFoodsBase: int,
    guardianFoodsSpread: int,
    /** 击败奖励按血量放大：倍数 = 血量 ÷ 这个值（用户 2026-10-07 定，3 万 = 1 星为 1 倍） */
    guardianRewardHp: int.min(1),
    injectCoin: int,
    refreshCoin: int,
    trialCoin: int,
    trialWorthMax: int,
    trialExpMax: int,
    trialProficiencyPerLevel: int,
    trialCap: num,
    rareOdds: int,
    /** 飞弹伤害覆盖：[道具 id, 最小, 最大]（试玩修复 14：集束飞弹太强） */
    missileAttack: z.array(z.tuple([int, int.min(0), int.min(0)])),
  }),
  /** 时令（天气改版设计 §3）：当令表、每份点数、时令铺 */
  shiling: z.object({
    minStar: int.min(0),
    /**
     * 每份点数 = 这道菜每种食材的现价之和 ÷ mysterious.baseNum ÷ k × (1 + gradeStep × (品级 − 1))（时令值改法 2026-10-13）；
     * 食材现价同菜场（基价 × market.levelPriceRate），每种按 1 份算（下锅时每种扣 cookNum 份）
     */
    k: num.positive(),
    gradeStep: num.min(0),
    /** 神殿试炼用时令值指定试炼菜 */
    trialPick: int.min(0),
    /** 支线“一周获得多少时令值” */
    week200: int.min(1),
    /** 每个游戏日余额超过 floor 的部分扣 rate（向下取整） */
    decay: z.object({ rate: num.min(0), floor: int.min(0) }),
    shop: z.object({
      remnantPerLevel: int.min(1),
      remnantWeekly: int.min(0),
      rarePrice: int.min(1),
      rareWeekly: int.min(0),
      /** [价格, 每周限购] */
      compass: z.tuple([int.min(1), int.min(0)]),
      lots: z.tuple([int.min(1), int.min(0)]),
    }),
    /** [天气 id, 当令的道]（1~6；特殊天气 1~6 全部） */
    roads: z.array(z.tuple([int, z.array(int.min(1).max(7)).min(1)])),
  }),
  bar: z.object({
    fgWinRate: num,
    fgDrawRate: num,
    /** 划拳输的最低概率：幸运加到胜上最多加到 1 - 平 - 它（问题记录 419） */
    fgLoseMin: num.min(0).max(1),
    fgNewsStreak: int.min(1),
    numMax: int.min(2),
    numCost: int.min(1),
    numLuckDiv: num,
    numAwardLevel: int.min(1),
    krabCoinTickets: int.min(1),
    slotCells: int.min(1),
    slotFloorSpins: int.min(1),
    slotFloorRate: num,
    slotFloorAwardId: int,
    /** 厨塔的随机奖励类型比例（字段在 bar 下是历史原因）；酒吧小游戏用 prize.rates */
    awardRates: awardRates,
    /**
     * 酒吧小游戏的随机奖励（问题记录 352）：类型比例；食材按奖励档次取 minLevel ≤ 档次的最后一项，
     * 从 levels 范围里出，rare 的概率出稀有食材（按出现权重抽）
     */
    prize: z.object({
      rates: awardRates,
      foodTiers: z
        .array(
          z.object({
            minLevel: int.min(1),
            levels: z
              .tuple([int.min(1).max(5), int.min(1).max(5)])
              .refine(([lo, hi]) => lo <= hi, 'min must be <= max'),
            rare: num.min(0).max(1),
          }),
        )
        .min(1)
        .refine((ts) => ts[0]?.minLevel === 1, 'first tier must start at minLevel 1')
        .refine(
          (ts) => ts.every((x, i) => i === 0 || x.minLevel > ts[i - 1]!.minLevel),
          'minLevel must increase',
        ),
    }),
    /** 猜酒杯（问题记录 427-5）：一局最多 cups.length 轮，第 i 轮 cups[i] 个杯子；第 i 轮猜中可以收手拿 tiers[i] */
    cup: z
      .object({
        cost: int.min(0),
        cups: z.array(int.min(2).max(10)).min(1),
        maxRate: num.min(0).max(1),
        tiers: z
          .array(
            z.object({
              awards: int.min(1),
              level: int.min(1),
              news: z.enum(['news', 'broadcast']).nullable(),
            }),
          )
          .min(1),
      })
      .refine((x) => x.cups.length === x.tiers.length, 'cups and tiers must have the same length'),
    /** 魔鬼辣杯（子项目 4C-3） */
    devil: z
      .object({
        stakes: z.array(int.min(1)).min(1),
        cups: int.min(2),
        /**
         * 赔付表（2026-10-09 用户定）：每档押注一行，第 k 个是活过 k 杯赢了拿回的礼券数（含押注）。
         * 押 1 是 1/2/3（新手试玩不亏），其余按 1.35 倍取整，庄家约 5%~7%（原来 1.4 倍是玩家赚）
         */
        payouts: z.array(z.array(int.min(0))),
        /** 每天最多几局（原来不限，连续玩可以稳定刷礼券） */
        dailyMax: int.min(1),
        hangoverMinutes: int.min(0),
        hangoverAtRate: num,
        newsSurvived: int.min(1),
      })
      .superRefine((d, ctx) => {
        const per = Math.floor(d.cups / 2);
        const ok =
          d.payouts.length === d.stakes.length &&
          d.payouts.every((row) => row.length === per && row.every((v, i) => i === 0 || v >= row[i - 1]!));
        if (!ok)
          ctx.addIssue({
            code: 'custom',
            path: ['payouts'],
            message: `devil payouts must have one row per stake, ${per} non-decreasing numbers each`,
          });
        // 押注档位不重复；押得多的那行每一格都不比押得少的少（backlog 1010）
        if (new Set(d.stakes).size !== d.stakes.length)
          ctx.addIssue({ code: 'custom', path: ['stakes'], message: 'devil stakes must be unique' });
        else if (ok) {
          const order = d.stakes.map((_, i) => i).sort((a, b) => d.stakes[a]! - d.stakes[b]!);
          const mono = order.every(
            (r, k) => k === 0 || d.payouts[r]!.every((v, i) => v >= d.payouts[order[k - 1]!]![i]!),
          );
          if (!mono)
            ctx.addIssue({
              code: 'custom',
              path: ['payouts'],
              message: 'devil payouts must not pay less for a bigger stake',
            });
        }
      }),
    /** 记忆调酒 */
    memory: z.object({
      cost: int.min(0),
      dailyMax: int.min(1),
      ingredients: int.min(2),
      lengths: z.array(int.min(1)).min(1),
      awardLevels: z.array(int.min(1)).min(1),
      flashMs: int.min(1),
      gapMs: int.min(0),
      earlyMs: int.min(0),
      answerBaseMs: int.min(0),
      answerPerItemMs: int.min(0),
    }),
    /** 飞镖 */
    darts: z.object({
      cost: int.min(0),
      dailyMax: int.min(1),
      periodMs: z.tuple([int.min(100), int.min(100)]),
      futureMs: int.min(0),
      latencyMs: int.min(0),
      rings: z.array(z.tuple([num, int])).min(1),
      bossOdds: z.array(z.tuple([int, int.min(0)])).min(1),
      winLevel: int.min(1),
      perfectLevel: int.min(1),
      tieRefund: int.min(0),
    }),
    /** 一掷千金（问题记录 427-3）：奖品洗进箱子，分轮开，银行家按剩余平均 × valueRate × 本轮系数报买断价 */
    deal: z
      .object({
        cost: int.min(0),
        dailyMax: int.min(1),
        prizes: z
          .array(z.object({ kind: z.enum(['food', 'master']), level: int.min(1).max(5), num: int.min(1) }))
          .min(3)
          .max(16),
        opens: z.array(int.min(1)).min(1),
        offerRates: z.array(num.min(0).max(1)).min(1),
        valueRate: num.min(0).max(1),
      })
      .refine((x) => x.opens.length === x.offerRates.length, 'opens and offerRates must have the same length')
      .refine(
        (x) => x.opens.reduce((a, b) => a + b, 0) === x.prizes.length - 2,
        'opens must sum to prizes - 2',
      ),
    /** 秘制调料（问题记录 427-2）：猜 kinds 种调料里 length 种的排列，最多 tries 次；按第几次猜中分档 */
    spice: z
      .object({
        cost: int.min(0),
        dailyMax: int.min(1),
        kinds: int.min(2).max(10),
        length: int.min(1),
        tries: int.min(1),
        tiers: z
          .array(
            z.object({ maxTries: int.min(1), awardLevel: int.min(1), renown: int.min(0), news: z.boolean() }),
          )
          .min(1),
      })
      .refine((x) => x.length <= x.kinds, 'length must be <= kinds')
      .refine(
        (x) => x.tiers.every((t, i) => i === 0 || t.maxTries > x.tiers[i - 1]!.maxTries),
        'tiers.maxTries must increase',
      )
      .refine((x) => x.tiers.at(-1)!.maxTries === x.tries, 'last tier must equal tries'),
    /** 最后一颗糖（问题记录 427-1）：两张桌子，合计每天 dailyMax 局 */
    nim: z.object({
      dailyMax: int.min(1),
      tables: z.object({ novice: nimTable, expert: nimTable }),
    }),
  }),
  tower: z.object({
    dailyBase: int.min(0),
    nightFloor: int.min(0),
    openHour: int.min(0).max(23),
    testStrength: int.min(0),
    strengthPerFloor: int.min(0),
    strengthBase: int.min(0),
    winRenownBase: int,
    loseRenown: int,
    rankSize: int.min(1).max(15),
    rankTop: int.min(0),
    rankGap: int.min(1),
    rankDaily: int.min(1),
    rankWinRenown: int,
    rankLoseRenown: int,
    rankGifts: z.array(z.tuple([int, int])).min(1),
    duelStrength: int.min(0),
    duelPerFriend: int.min(1),
    duelWeakRate: num,
    duelStrongRate: num,
    duelRenown: z.object({
      weak: z.tuple([int, int]),
      strong: z.tuple([int, int]),
      normal: z.tuple([int, int]),
    }),
    /**
     * 赛厨评分和评委（问题记录 396）：五项（色香味形养）各 = 属性 × 权重之和 + 特色菜每份价值 × mc + 波动，
     * 波动 = 创意 × wave × max(0, 1 + 幸运率) × rand；每局抽 judges 位评委，过半票数赢
     */
    duel: z.object({
      wave: num.min(0),
      weights: z
        .array(
          z.object({
            cook: num.min(0),
            cutting: num.min(0),
            fire: num.min(0),
            season: num.min(0),
            mc: num.min(0),
          }),
        )
        .length(5),
      judges: int.min(1).max(DUEL_JUDGES.length),
    }),
    /** 打赢长老（正式挑战）时掉一件这层套装的概率，按层（问题记录 408） */
    elderDropRates: z.array(num.min(0).max(1)).length(10),
    /** 打赢第几层（含）以上的长老、掉了厨具才上新闻（backlog 408 审查：低层掉得多，会刷屏） */
    elderNewsFloor: int.min(1),
    sparFullAt: int.min(0),
    sparFullRenown: int,
    sparMaxAt: int.min(0),
    sparAwards: z.array(z.tuple([int, int.min(0), int.min(1)])).min(1),
    sparEquipFlag: int.min(0),
    watchmanCook: z.object({ hour: int.min(0).max(23), minute: int.min(0).max(59), priceSpread: num }),
  }),
  takeaway: z.object({
    openStar: int.min(0),
    openRenown: int.min(0),
    openCoin: int.min(0),
    openDiamond: int.min(0),
    publicBase: int.min(0),
    publicRand: int.min(1),
    publicPerOpen: int.min(1),
    publicMinOpen: int.min(0),
    publicOpenFloor: int.min(0),
    gradeRates: z.array(num).length(7),
    minutesBase: int.min(1),
    minutesPerGrade: int.min(1),
    renownPerGrade: int.min(0),
    refreshNum: int.min(1),
    refreshCoin: int.min(0),
    refreshRenown: int.min(0),
    priceLine: int.min(1),
    coinRates: z.tuple([num, num]),
    expRates: z.tuple([num, num]),
    expDiv: num,
    successFloat: int.min(2),
    luckOddsRate: num,
    privateExpRate: num,
    friendRiderRate: num,
    rebateDiv: int.min(1),
    failExpRate: num,
    customer: z.object({ base: num, luckDiv: num, success: int, fail: int }),
    rider: z.object({
      maxLevel: int.min(1),
      expPerLevel2: int.min(0),
      expBase: int.min(1),
      timeSubMax: int.min(0),
      expAdd: int.min(0),
      coinAdd: int.min(0),
      renownEvery: int.min(1),
      oddsBase: int.min(0),
      oddsPerLevel: int.min(0),
      oddsMax: int.min(0),
      maxNumEvery: int.min(1),
      capLevels: z.array(int),
      dismissCoin: int.min(0),
      dismissExp: int.min(0),
    }),
    awards: z.array(z.tuple([int, int.min(0), num])).min(1),
    keepOpenDays: int.min(0),
    keepDoneDays: int.min(0),
  }),
  town: z.object({
    broadcast: z.object({
      minStar: int.min(0),
      cooldownSec: int.min(0),
      maxLen: int.min(1),
      homeHours: int.min(1),
    }),
    npc: z.object({
      bigEaterLevelWeights: z.array(num.min(0)).length(5),
      bigEaterNum: z.tuple([int.min(1), int.min(1)]),
      wenjieNum: z.tuple([int.min(1), int.min(1)]),
      bro13Num: z.tuple([int.min(1), int.min(1)]),
    }),
    shake: z.object({
      base: int.min(1),
      rand: int.min(1),
      eggMod: int.min(1),
      eggTail: int.min(0),
      burgerEvery: int.min(1),
      burgerNum: int.min(1),
      krabCoinNum: int.min(1),
      limitIp: z.boolean(),
      limitDevice: z.boolean(),
      krabDailyCoin: int.min(0),
    }),
    news: z.object({ pageSize: int.min(1).max(200) }),
    rareExchange: z.boolean(),
    mysteryExclude: z.array(int),
    exchangeMaxNum: int.min(1),
  }),
  /** 工作证（天气改版设计 §4）：每周日 hour 点按本周获得的时令值，minGain 以上的前 count 名依次抽一张；cards = [证, 工资礼包] */
  jobCard: z.object({
    hour: int.min(0).max(23),
    count: int.min(0),
    minGain: int.min(1),
    cards: z.array(z.tuple([int, int])).min(1),
  }),
  rank: z.object({ top: int.min(1), cacheSeconds: int.min(0), powerCacheSeconds: int.min(0) }),
  mail: z.object({ expiresDays: int.min(1), listMax: int.min(1).max(500) }),
  invite: z.object({
    monthlyCap: int.min(1),
    levels: z.object({ lv10: int.min(1), lv30: int.min(1) }),
    newbie: rewardSchema,
    rewards: z.object({ lv10: rewardSchema, lv30: rewardSchema }),
  }),
  report: z.object({ dailyMax: int.min(1) }),
  ops: z.object({
    suspicious: z.object({
      barPerfectDaily: int.min(1),
      dartsBullDaily: int.min(1),
      sharedAccounts: int.min(2),
      topN: int.min(1).max(200),
    }),
  }),
  redeem: z.object({ failLimit: int.min(1), failWindowSec: int.min(1), batchMax: int.min(1).max(1000) }),
  /** 自由交易市场（156-1） */
  exchange: z.object({
    minLevel: int.min(1),
    minAccountDays: int.min(0),
    feeRate: z.number().min(0).max(0.5),
    bandLow: z.number().positive().max(1),
    bandHigh: z.number().min(1),
    refMinTrades: int.min(1),
    maxOpenOrders: int.min(1),
    orderHours: int.min(1),
    maxQty: int.min(1).max(999),
    /** 不能上交易所的食材等级（问题记录 461：六级暂定关掉）；已挂着的单在下一次过期任务时下架退回 */
    closedLevels: z.array(int.min(1).max(9)),
    /** 进阶防作弊（156-2） */
    suspicious: z.object({
      traceDays: int.min(1),
      edgeHigh: z.number().min(1),
      edgeLow: z.number().positive().max(1),
      repeatDays: int.min(1),
      repeatCount: int.min(2),
      largeAmount: int.min(1),
      holdHours: int.min(0),
    }),
    /** 系统做市（156-3） */
    maker: z
      .object({
        enabled: z.boolean(),
        bidRate: z.number().positive(),
        askRate: z.number().positive(),
        /** 不超过 1：否则从菜场买来卖给系统能赚钱（156-3 终审 I3） */
        marketCapRate: z.number().positive().max(1),
        dailyBuy: int.min(0),
        stockMax: int.min(0),
        playerDaily: int.min(0),
        /** 系统不收的等级（经济分析 2026-10-08：7 级食材系统收约 70 万，比开店赚得多） */
        noBidLevels: z.array(int).default([]),
      })
      // 收购倍数要低于卖出倍数，否则从系统买进再卖回给系统能赚钱（156-3 终审 I3）
      .refine((m) => m.bidRate < m.askRate, { message: 'bidRate 要小于 askRate' }),
    // 不超过单价上限 1 亿：再大价格下限就超过单价上限，任何挂单都过不了校验（backlog 156-1）
    refOverrides: z.record(z.string(), int.min(1).max(100_000_000)),
  }),
  /** 事件合约（238-1） */
  predict: z.object({
    unit: int.min(1),
    feeRate: z.number().min(0).max(0.5),
    maxHold: int.min(1),
    maxTrade: int.min(1).max(999),
    defaultB: int.min(10).max(10000),
    minLevel: int.min(1),
    minAccountDays: int.min(0),
    /** 系统自动出题（238-2） */
    auto: z.object({
      krab: z.boolean(),
      market: z.boolean(),
      weather: z.boolean(),
      wish: z.boolean(),
      b: int.min(10).max(10000),
      marketCloseMin: int.min(1).max(60),
      wishCloseMin: int.min(1).max(60),
    }),
  }),
  /** 一番赏 */
  kuji: z.object({
    price: int.min(1),
    dailyBuy: int.min(1),
    maxDraw: int.min(1).max(100),
    activeTickets: int.min(0),
    /** 领活跃度这一档时送券（问题记录 318：新增 180 档后仍在 150 档送） */
    activeTicketPoints: int.min(1),
    /** 每个区服每天最多开几池（问题记录 274） */
    maxPools: int.min(1),
    /** 买券、抽签门槛（2026-10-16 小号刷豪华池）：餐厅等级、账号注册天数，另外都要验证邮箱 */
    minLevel: int.min(1),
    minAccountDays: int.min(0),
    tiers: kujiTiers,
    last: kujiLast,
    /** 豪华一番赏（240-2）：一条独立的奖池线，结构和普通池的价格、限购、档位、最后赏相同 */
    deluxe: z.object({
      price: int.min(1),
      dailyBuy: int.min(1),
      maxDraw: int.min(1).max(100),
      maxPools: int.min(1),
      minLevel: int.min(1),
      minAccountDays: int.min(0),
      tiers: kujiTiers,
      last: kujiLast,
    }),
  }),
  /** 个人缺料倾向（问题记录 50、68）：随机食材有 p 的概率改成本街学菜正缺的；p = min(上限, 基础 + 幸运率 × 系数) */
  scarcity: z
    .object({
      needBase: z.number().min(0).max(1),
      needLuckFactor: z.number().min(0),
      needMax: z.number().min(0).max(1),
    })
    .refine((s) => s.needBase <= s.needMax, { message: 'scarcity needBase must not exceed needMax' }),
  /** 小镇日报（2026-10-08）：游戏时间 hour:minute 以后写前一天的日报；autoPublish 关着时写好先等后台审核 */
  daily: z.object({
    autoPublish: z.boolean(),
    hour: int.min(0).max(23),
    minute: int.min(0).max(59),
    /** 逐条交给 AI 的新闻最多几条 */
    maxEvents: int.min(5).max(60),
  }),
  /**
   * 收购（问题记录 421；改版 2026-10-16）：身价 = 基础身价 × 热度；基础身价 = 近 priceDays 天日均结算银币 × priceMultiple，不低于 minPrice。
   * 系统不印钱：被收购的店每轮结算让 cedeRate 给老板（老板当天打理过 cedeTendRate），买卖、赎身按各自比例分账，其余销毁
   */
  acquire: z
    .object({
      priceDays: int.min(1),
      priceMultiple: num.gt(0),
      minPrice: int.min(1),
      heatStep: num.min(0),
      heatListDrop: num.min(0),
      heatMax: num.min(1),
      heatDecay: z.number().min(0).max(1),
      taxRate: z.number().min(0).max(1),
      protectDays: int.min(0),
      /** 刚到 minStar 星的店几天内不能被强收 */
      newStarProtectDays: int.min(0),
      maxHoldings: int.min(1),
      /** 一家店每天最多被强收几次 */
      maxPerDay: int.min(1),
      pairDays: int.min(0),
      linkDays: int.min(1),
      minStar: int.min(0),
      listMinRate: z.number().min(0.05).max(1),
      listMaxRate: z.number().min(1).max(5),
      listDays: int.min(1),
      /** 买家（强收、买挂牌）至少几星、注册满几天、每天最多买几家 */
      buyerMinStar: int.min(0),
      buyerMinAccountDays: int.min(0),
      buyerMaxPerDay: int.min(1),
      /** 强收没有老板的店：店得 firstStoreRate，并购咨询费 firstBurnRate 销毁，其余是税 */
      firstStoreRate: z.number().min(0).max(1),
      firstBurnRate: z.number().min(0).max(1),
      /** 买挂牌：店得 resaleStoreRate，税 taxRate，其余给原老板 */
      resaleStoreRate: z.number().min(0).max(1),
      /** 赎身：redeemBurnRate 销毁，税 taxRate，其余给老板 */
      redeemBurnRate: z.number().min(0).max(1),
      cedeRate: z.number().min(0).max(1),
      cedeTendRate: z.number().min(0).max(1),
      /** 老板打理以后这家店当天之后的结算银币 × tendMultiplier */
      tendMultiplier: num.min(1),
      /** 老板打理一次付这家店日均的多少（销毁） */
      tendCostRate: z.number().min(0).max(1),
      /** 打理送店的补给包：日均每满 tendPackStep 送 1 个，最多 tendPackMax 个 */
      tendPackGoods: int.min(1),
      tendPackStep: int.min(1),
      tendPackMax: int.min(0),
      /** 老板几天没打理：抽成减半、不再抽成、自动放手 */
      tendHalfDays: int.min(1),
      tendStopDays: int.min(1),
      tendReleaseDays: int.min(1),
      newsMinPrice: int.min(0),
    })
    .refine((a) => a.firstStoreRate + a.firstBurnRate + a.taxRate <= 1 + 1e-9, {
      message: 'firstStoreRate + firstBurnRate + taxRate 不能超过 1',
    })
    .refine((a) => a.resaleStoreRate + a.taxRate <= 1 + 1e-9, {
      message: 'resaleStoreRate + taxRate 不能超过 1',
    })
    .refine((a) => a.redeemBurnRate + a.taxRate <= 1 + 1e-9, {
      message: 'redeemBurnRate + taxRate 不能超过 1',
    })
    .refine((a) => a.tendHalfDays <= a.tendStopDays && a.tendStopDays <= a.tendReleaseDays, {
      message: 'tendHalfDays ≤ tendStopDays ≤ tendReleaseDays',
    }),
  /** 小镇发展基金（240-2）：存期、到期领回和提前取出的比例、三档 */
  fund: z.object({
    days: int.min(1),
    returnRate: z.number().gt(0).max(1),
    earlyRate: z.number().gt(0).max(1),
    tiers: z
      .array(
        z.object({
          key: z.string().min(1).max(16),
          coin: int.min(1),
          medal: int.min(1),
          news: z.enum(['broadcast', 'news']).optional(),
        }),
      )
      .min(1),
  }),
  forum: z.object({
    titleMax: int.min(1),
    contentMax: int.min(1),
    replyMax: int.min(1),
    queryMax: int.min(1),
    postCooldownSec: int.min(0),
    postDailyMax: int.min(1),
    replyCooldownSec: int.min(0),
    pageSize: int.min(1).max(100),
    excerpt: int.min(1),
    readsMax: int.min(1),
    featureReward: z.object({ goods: z.array(z.tuple([int, int.min(1)])), diamond: int.min(0) }),
  }),
  /** 食材期货（期货设计 2026-10-10）：点名订食材，付定金，deliverHours 小时后扣尾款交货 */
  futures: z.object({
    deliverHours: int.min(1),
    premium: num.min(1),
    capRate: num.min(1),
    depositRate: num.gt(0).max(1),
    dailyQuota: z.array(int.min(0)).length(5),
    personDaily: int.min(1),
  }),
  /** 食材理财（理财设计 2026-10-10）：锁银币 days 天，到期本金全退，每 unit 银币给 perUnit 个街市补给包 */
  wealth: z.object({
    minLevel: int.min(1),
    unit: int.min(1),
    maxActive: int.min(1),
    maxTotal: int.min(1),
    earlyRate: num.gt(0).max(1),
    terms: z.array(z.object({ days: int.min(1), goods: int.min(1), perUnit: int.min(1) })).min(1),
  }),
  /** 特许大宗认购（大宗认购设计 2026-10-10）：每天一批 n 份，统一价竞价，随机收盘 */
  bulk: z.object({
    openHour: int.min(0).max(23),
    hours: int.min(1),
    closeWindowMin: int.min(1),
    qty: z.array(int.min(1)).length(5),
    levelWeights: z
      .array(num.min(0))
      .length(5)
      .refine((w) => w.some((x) => x > 0), 'at least one level weight must be > 0'),
    reserveRate: num.min(1),
    capRate: num.gt(0).max(1),
    groupRate: num.gt(0).max(1),
    minRaise: num.gt(0).max(1),
    cooldownSec: int.min(0),
    consolationRate: num.min(0).max(1),
    consolation: z.object({ goods: int.min(1), num: int.min(1) }),
    /** 名义结束前多少分钟起看板停更（问题记录 595）：0 = 全程实时 */
    blindMin: int.min(0),
    /** 按全服缺口挑食材（2026-10-22）：缺口 ÷ 每批份数排前 topK、至少 minRests 家店缺，近 cooldownDays 天开过的跳过 */
    pick: z.object({
      topK: int.min(1),
      minRests: int.min(1),
      cooldownDays: int.min(0),
      activeDays: int.min(1),
    }),
  }),
  /** 许愿树（许愿树设计 2026-10-11）：每天一轮，许愿的店里抽 1 家得树上的道具 */
  wishTree: z.object({
    hour: int.min(0).max(23),
    minLevel: int.min(1),
    titleDays: int.min(1),
    consolationLevel: int.min(1),
    prizes: z.array(z.object({ goods: int.min(1), num: int.min(1), weight: num.gt(0) })).min(1),
  }),
  /** 成就（设计稿 2026-10-19）：排行门槛、展示柜格数、首达和新闻的点数线 */
  achieve: z.object({
    rankMinLevel: int.min(1),
    rankMinAccountDays: int.min(0),
    /** [成就点, 展示柜格数]，按成就点从小到大 */
    shelfSlots: z.array(z.tuple([int.min(0), int.min(1)])).min(1),
    firstMinPts: int.min(1),
    newsMinPts: int.min(1),
    rarityCacheSeconds: int.min(0),
  }),
});

export type Tuning = z.infer<typeof tuningSchema>;
