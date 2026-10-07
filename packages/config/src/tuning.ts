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
    adiaoOverflowRate: num,
    negativeRenownAtRate: num,
    starPotential: z.array(num),
    // 低等级经验加成（问题记录 378）：1 级 +rate，线性减到 maxLevel 为 0
    newbieExp: z.object({ maxLevel: int.min(2), rate: num.min(0) }),
    cteRate: num,
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
    huskyRate: num,
    painting13Rate: num,
    painting13Hours: num,
    pickyMaxGrade: int,
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
    autoRefuelThreshold: int,
    concurrency: int.min(1),
    batchSize: int.min(1),
  }),
  collection: z.object({
    plaquePer: num,
    an2023Multiplier: num,
    honorPer: num,
    mdcgMultiplier: num,
    an2025CoinBonus: num,
  }),
  strength: z.object({ regen: int, luckyRegen: int }),
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
    driveKrabStrength: int,
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
    exchangeMaxTimes: int.min(1),
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
    specialPrice: int,
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
    maxBuy: int.min(1),
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
  }),
  friend: z.object({
    requireVerifiedEmail: z.boolean(),
    maxFriends: int.min(1),
    dine: z.object({
      minMinutes: int.min(0),
      strengthPerHour: int,
      strengthMax: int,
      heartExpMul: num,
      heartStrengthMul: num,
      baseSeats: int.min(0),
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
      blessedRate: num,
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
    appraiseRetryBelow: int,
    tasteDaily: int.min(1),
    tasteAwardMax: int,
    tasteMcRate: num,
    tasteGradeFactor: num,
    lessonLearnRate: num,
    lessonStealRate: num,
    lessonStealPerLevel: num,
    thinkerStealBonus: num,
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
    championGoodsId: int,
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
    krakenHours: z.array(z.tuple([int, int])).min(1),
    krakenRates: z.object({ same: num, road: num, other: num }),
    krabCoinRate: num,
    tentacleFavor: int,
    tentacleRate: num,
    forgetRate: num,
    shopSlots: int.min(1),
    shopExclude: z.array(int),
    /** 飞弹伤害覆盖：[道具 id, 最小, 最大]（试玩修复 14：集束飞弹太强） */
    missileAttack: z.array(z.tuple([int, int.min(0), int.min(0)])),
  }),
  yard: z.object({
    maxLands: int.min(1),
    landBaseCoin: int,
    landMaxLevel: int.min(1),
    yieldPerLevel: num,
    dryWaterSub: int,
    dryWaterMinRate: num,
    removeSeedRate: num,
    stealKeepRate: num,
    stealMax: int.min(1),
    reapPunishRate: num,
    seedShop: z.boolean(),
    seedPriceRate: num,
    formulaMainRate: num,
    formulaAppraiseRatePerLuck: num,
    composeStrength: int,
    composeCritRate: num,
    essenceMain: int,
    essenceSub: int,
    events: z.object({
      minutes: z.array(int.min(0).max(59)).min(1),
      nightMinute: int.min(0).max(59),
      dayFrom: int.min(0).max(23),
      dayTo: int.min(1).max(24),
      wormEatRate: num,
      grassEatRate: num,
      dryDeath: int,
      grassRate: num,
      grassDryFactor: num,
      dryAddRate: num,
      dryStartRate: num,
      dryStartGrassRate: num,
      wormRate: num,
    }),
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
    devil: z.object({
      stakes: z.array(int.min(1)).min(1),
      cups: int.min(2),
      rate: num.min(1),
      hangoverMinutes: int.min(0),
      hangoverAtRate: num,
      newsSurvived: int.min(1),
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
    broadcast: z.object({ minStar: int.min(0), cooldownSec: int.min(0), maxLen: int.min(1) }),
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
    hammer: z.object({
      cooldownHours: num.min(0),
      gapSec: int.min(0),
      coin: int.min(0),
      diamond: int.min(0),
    }),
    bless: z.object({ lampCoinBonus: num.min(0) }),
    news: z.object({ pageSize: int.min(1).max(200) }),
    rareExchange: z.boolean(),
    mysteryExclude: z.array(int),
    exchangeMaxNum: int.min(1),
  }),
  hiphop: z.object({
    hour: int.min(0).max(23),
    closeHour: int.min(1).max(24),
    weeklyHour: int.min(0).max(23),
    placeWeights: z.array(z.tuple([int, num.min(0)])).min(1),
    restActiveDays: int.min(1),
    worthBase: int.min(1),
    worthMin: num.min(0),
    worthRand: num.min(0),
    krabRate: num.min(0),
    foodFactor: num.min(0),
    coinMax: int.min(1),
    coinWorthDiv: num.min(1),
    coinExpDiv: num.min(1),
    diamondMax: int.min(1),
    diamondWorthNum: int.min(1),
    diamondWorthDen: int.min(1),
    diamondExpMul: num.min(0),
    expJitter: num.min(0).max(1),
    requireVerifiedEmail: z.boolean(),
    weeklyCards: z.array(int).min(1),
    wages: z.array(z.tuple([int, int])),
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
      stats: z.boolean(),
      b: int.min(10).max(10000),
      marketCloseMin: int.min(1).max(60),
      statsCloseHour: int.min(1).max(23),
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
    tiers: kujiTiers,
    last: kujiLast,
    /** 豪华一番赏（240-2）：一条独立的奖池线，结构和普通池的价格、限购、档位、最后赏相同 */
    deluxe: z.object({
      price: int.min(1),
      dailyBuy: int.min(1),
      maxDraw: int.min(1).max(100),
      maxPools: int.min(1),
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
  /**
   * 收购（问题记录 421）：身价 = 基础身价 × 热度；基础身价 = 近 priceDays 天日均结算银币 × priceMultiple，不低于 minPrice。
   * 钱只在玩家之间流动，系统只收 taxRate；分红、打理的数值在收购 PR 2 用到
   */
  acquire: z.object({
    priceDays: int.min(1),
    priceMultiple: num.min(0),
    minPrice: int.min(1),
    heatStep: num.min(0),
    heatListDrop: num.min(0),
    heatMax: num.min(1),
    heatDecay: z.number().min(0).max(1),
    taxRate: z.number().min(0).max(1),
    protectDays: int.min(0),
    maxHoldings: int.min(1),
    maxPerDay: int.min(1),
    pairDays: int.min(0),
    linkDays: int.min(1),
    minStar: int.min(0),
    listMinRate: z.number().min(0.05).max(1),
    listDays: int.min(1),
    dividendRate: z.number().min(0).max(1),
    tendBonus: num.min(0),
    minRounds: int.min(0),
    dividendCapRate: z.number().min(0).max(1),
    tendFoods: int.min(0),
    newsMinPrice: int.min(0),
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
});

export type Tuning = z.infer<typeof tuningSchema>;
