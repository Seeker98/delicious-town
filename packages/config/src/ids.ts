import { SHARED_FOODS, SHARED_GOODS } from '@dt/shared';

/** 代码里直接引用的道具 id（规格书 00~07、20）。定义在 data/master/goods.json */
export const GOODS = {
  mysteryTicket: SHARED_GOODS.mysteryTicket, // 神秘礼券
  moveCard: 10401, // 搬家卡
  mysteryFoodExchange: 10110, // 神秘食材兑换券
  shortOilSaver: 30201, // 短效节油器
  normalPoster: 30001, // 普通宣传海报（模拟器买的便宜海报）
  bronzeTrophy: 30101, // 小镇食神奖杯(铜)（模拟器买的便宜奖杯）
  resetAttrCard: 10412, // 洗点卡
  renameCard: 10411, // 改名卡
  tableA: 10413, // 餐桌A
  starCert: 10505, // 升星凭证
  starPromoHonor: SHARED_GOODS.starPromoHonor, // 升星促销勋章
  promoHonor: 60203, // 八折促销
  moveJobHonor: 60405, // 搬家处工作证
  marketJobHonor: 60401, // 菜场工作证（手动进货）
  renameJobHonor: 60403, // 改名处工作证
  hiphopCulture: 60503, // 嘻哈文化（嘻哈男孩所在餐厅）
  mayorFavor: 60504, // 镇长的推荐
  mayorAgainst: 60505, // 镇长的针对
  signInGift: 20003, // 每日签到礼包
  krabHappy: 60501, // 蟹老板（回味无穷）
  krabAngry: 60502, // 蟹老板-生气
  plankton: 60509, // 痞老板
  starBlessing: 60510, // 星神眷顾
  krabburgerBook: 10814, // 蟹黄堡秘方
  mysteryRecipe: 10811, // 神秘食谱
  fragmentBase: 10800, // 残卷碎片 = 10800 + 特色菜等级（10801~10806）
  hundredMaster: 61702, // 百世之师（强制结束课程）
  spongeBob: 60508, // 海绵宝宝（烹制时点赞）
  starBook: 61406, // 星神之书（鉴定重抽）
  humanSon: 61204, // 人类之子-名画（每份价值加成，计划裁定 2）
  thinker: 61601, // 思想者-雕像
  luckyCookie: 10418, // 幸运饼干
  loveNecklace: 60204, // 爱心项链
  adventureMap: 10704, // 探险图
  krabCoin: SHARED_GOODS.krabCoin, // 蟹币
  dtTicket: 10007, // 美味券
  apolloStatue: 61603, // 阿波罗-雕像（银币转经验）
  armStatue: 61604, // 非洲复兴纪念碑-雕像（赶走生气的蟹老板）
  an2023Plaque: 30508, // 2023 纪念牌匾
  an2025Plaque: 30522, // 2025 纪念牌匾
  mdcgPlaque: 30523, // 马到成功
  purpleShell: 10506, // 泛紫海螺
  redPants: 60304, // 红内裤
  roachKiller: 61401, // 午夜蟑螂杀手（灭蟑能手）
  firecracker: 60305, // 鞭炮
  lantern: 60306, // 灯笼
  fu: 60307, // 福
  bangle: 60205, // 银手镯
  heartache: 61001, // 痛心入骨
  godsHand: 61002, // 神之一手
  thumbKing: 61411, // 点赞王
  magicLamp: 61415, // 神灯
  excitedHeart: 61416, // 激动的心
  voodoo: 61422, // 巫毒娃娃
  townCare: 60512, // 镇长的关心
  essence: 10603, // 厨具精华
  stressStone: 10601, // 强化石
  drillStone: 10602, // 打孔石
  backStressOne: 10605, // 归元石（回退 1 级）
  backStressAll: 10604, // 神秘水晶（回退 10 级）
  missileCluster: 10701, // 集束飞弹
  missileNormal: 10702, // 普通飞弹
  missileBurst: 10703, // 爆裂飞弹
  mapNormal: 10704, // 探险图
  mapHigh: 10705, // 高级探险图
  seal: 10813, // 厨神玉玺
  securityCard: 60404, // 保安证
  creativePotion: 61407, // 创意药水（试炼准备：注射）
  meditation: 61408, // 冥想（试炼准备）
  lamp: 61413, // 煤油灯
  needle: 61414, // 欲望之针（规格书写作"指南针"）
  starKey: 61418, // 星光之钥
  exploreBook: 61420, // 探险者秘籍
  tentacle: 10708, // 克拉肯断裂的触手
  dreamNet: 61426, // 捕梦网
  formulaScroll: 10903, // 玄奥配方
  moonScroll: 61425, // 星月密卷（配方鉴定 +10%、辅碎片转主碎片）
  starTear: 61427, // 星神之泪（配方合成额外产出）
  formulaEssence: 10904, // 配方精华（essence 是厨具精华）
  borderCollie: 60604, // 边牧（偷菜惩罚）
  towerTicket: 10301, // 厨塔挑战券
  takeawayTicket: 10302, // 外卖券
  shopJobHonor: 60402, // 商店工作证（外卖私人刷新）
  horn: 10417, // 喇叭（小镇广播）
  kujiTicket: 10303, // 一番赏抽赏券
  kujiDeluxeTicket: 10304, // 豪华签券（240-2）
  thorHammer: 61405, // 雷神锤
  krabBurger: 10005, // 蟹黄堡
  levelTicketBase: 10100, // N 级食材兑换券 = 10100 + N（10101~10105）
} as const;

/** 万能食材：id = 9000 + 食材等级（1~5 级） */
export const FOODS = {
  masterBase: SHARED_FOODS.masterBase,
  masterLevel1: SHARED_FOODS.masterLevel1,
  masterLevel2: SHARED_FOODS.masterLevel2,
} as const;

/** 道具类型（goods.type） */
export const GOODS_TYPE = {
  consumable: 0,
  item: 1,
  gift: 2,
  device: 3,
  equip: 4,
  gem: 5,
  remnant: 8,
  honor: 9,
  souvenir: 10,
} as const;

/** 牌匾的 devicetype；盆栽、名画勋章的 devicetype */
export const DEVICE_TYPE = { plaque: 6, pot: 36, painting: 41 } as const;

/** 厨具六项属性（生成、强化、宝石都按这个名字） */
export const EQUIP_ATTRS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const;

/** 不构成套装的 suitid：0 无套装，90 玉•xx之帽、99 铉•xx之帽（规格书 20 §20.15） */
export const NON_SUIT_IDS: ReadonlySet<number> = new Set([0, 90, 99]);

/** 赞助帽子（子项目 6A）：发放时可以按件命名，显示为"玉•{名字}之帽"；铉级在餐厅六星时自动换给（设计 §5） */
export const SPONSOR_HATS = { jade: 41036, xuan: 41135 } as const;
export type HatTier = keyof typeof SPONSOR_HATS;

/**
 * 后台专用、游戏里拿不到、又没下架的道具：开放接口和 Wiki 不显示（问题记录 142）。现在没有：升星促销勋章礼包（测试）2026-10-07 下架了；
 * 下架的（开发测试礼包、测试勋章等，game/retired.json）开放接口本来就不显示，不再列
 */
export const WIKI_HIDDEN_GOODS: ReadonlySet<number> = new Set<number>([]);

/** 问题记录 331：新手大礼包；一到五级食材随机券 = foodVoucherBase + 等级（10201~10205）；packCode 是老店补领大礼包的新手码 */
export const NEWBIE = { pack: 20002, foodVoucherBase: 10200, packCode: 'XINSHOULIBAO' } as const;

/** 食材理财（理财设计 §1.1）：一到五级街市补给包 = packBase + 等级（10211~10215），在“食材随机券”小类里 */
export const WEALTH = { packBase: 10210 } as const;

/** 240-2：小镇发展基金勋章（定义在主表，game/fund.json 只配称号），C·流动赋能、B·增值资本、A·基石领投 */
export const FUND = { C: 61904, B: 61905, A: 61906 } as const;
/** 全部基金勋章：领取时一起去掉（不叠加），也不算进勋章收藏加成（只加经验，不加银币） */
export const FUND_MEDALS: ReadonlySet<number> = new Set(Object.values(FUND));
