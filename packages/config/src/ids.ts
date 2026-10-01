import { SHARED_GOODS } from '@dt/shared';

/** 代码里直接引用的道具 id（规格书 00~07、20）。改动时同步检查 data/dataset/goods.json */
export const GOODS = {
  mysteryTicket: SHARED_GOODS.mysteryTicket, // 神秘礼券
  moveCard: 2, // 搬家卡
  mysteryFoodExchange: 20, // 神秘食材兑换券
  shortOilSaver: 21, // 短效节油器
  resetAttrCard: 55, // 洗点卡
  renameCard: 53, // 改名卡
  tableA: 82, // 餐桌A
  starCert: 86, // 升星凭证
  starPromoHonor: 87, // 升星促销勋章
  promoHonor: 106, // 八折促销
  moveJobHonor: 111, // 搬家处工作证
  marketJobHonor: 107, // 菜场工作证（手动进货）
  renameJobHonor: 109, // 改名处工作证
  hiphopCulture: 230, // 嘻哈文化（嘻哈男孩所在餐厅）
  mayorFavor: 231, // 镇长的推荐
  mayorAgainst: 232, // 镇长的针对
  signInGift: 115, // 每日签到礼包
  krabHappy: 133, // 蟹老板（回味无穷）
  krabAngry: 134, // 蟹老板-生气
  plankton: 363, // 痞老板
  starBlessing: 364, // 星神眷顾
  krabburgerBook: 165, // 蟹黄堡秘方
  mysteryRecipe: 162, // 神秘食谱
  fragmentBase: 180, // 残卷碎片 = 180 + 特色菜等级（181~186）
  hundredMaster: 216, // 百世之师（强制结束课程）
  spongeBob: 304, // 海绵宝宝（烹制时点赞）
  starBook: 323, // 星神之书（鉴定重抽）
  humanSon: 349, // 人类之子-名画（每份价值加成，计划裁定 2）
  thinker: 397, // 思想者-雕像
  luckyCookie: 491, // 幸运饼干
  loveNecklace: 167, // 爱心项链
  adventureMap: 170, // 探险图
  krabCoin: SHARED_GOODS.krabCoin, // 蟹币
  dtTicket: 310, // 美味券
  apolloStatue: 438, // 阿波罗-雕像（银币转经验）
  armStatue: 439, // 非洲复兴纪念碑-雕像（赶走生气的蟹老板）
  an2023Plaque: 166, // 2023 纪念牌匾
  an2025Plaque: 526, // 2025 纪念牌匾
  mdcgPlaque: 619, // 马到成功
  purpleShell: 610, // 泛紫海螺
  redPants: 100, // 红内裤
  roachKiller: 156, // 午夜蟑螂杀手（灭蟑能手）
  firecracker: 157, // 鞭炮
  lantern: 158, // 灯笼
  fu: 159, // 福
  bangle: 228, // 银手镯
  heartache: 250, // 痛心入骨
  godsHand: 251, // 神之一手
  thumbKing: 348, // 点赞王
  magicLamp: 389, // 神灯
  excitedHeart: 406, // 激动的心
  voodoo: 423, // 巫毒娃娃
  townCare: 459, // 镇长的关心
  essence: 52, // 厨具精华
  stressStone: 40, // 强化石
  drillStone: 46, // 打孔石
  backStressOne: 225, // 归元石（回退 1 级）
  backStressAll: 224, // 神秘水晶（回退 10 级）
  missileSpeed: 17, // 极速飞弹
  missileNormal: 18, // 普通飞弹
  missileBurst: 19, // 爆裂飞弹
  mapNormal: 170, // 探险图
  mapHigh: 171, // 高级探险图
  seal: 164, // 厨神玉玺
  securityCard: 110, // 保安证
  creativePotion: 326, // 创意药水（试炼准备：注射）
  meditation: 327, // 冥想（试炼准备）
  lamp: 377, // 煤油灯
  needle: 378, // 欲望之针（规格书写作"指南针"）
  starKey: 408, // 星光之钥
  exploreBook: 416, // 探险者秘籍
  tentacle: 434, // 克拉肯断裂的触手
  dreamNet: 468, // 捕梦网
  formulaScroll: 464, // 玄奥配方
  moonScroll: 465, // 星月密卷（配方鉴定 +10%、辅碎片转主碎片）
  starTear: 469, // 星神之泪（配方合成额外产出）
  formulaEssence: 470, // 配方精华（essence 是厨具精华）
  borderCollie: 339, // 边牧（偷菜惩罚）
  towerTicket: 136, // 厨塔挑战券
  takeawayTicket: 263, // 外卖券
  shopJobHonor: 108, // 商店工作证（外卖私人刷新）
  horn: 315, // 喇叭（小镇广播）
  thorHammer: 256, // 雷神锤
  krabBurger: 180, // 蟹黄堡（注意：fragmentBase 也是 180，碎片是 181~186）
  levelTicketBase: 240, // N 级食材兑换券 = 240 + N（241~245）
} as const;

/** 万能食材：id = 466 + 食材等级（1~5 级） */
export const FOODS = {
  masterBase: 466,
  masterLevel1: 467,
  masterLevel2: 468,
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
} as const;

/** 牌匾的 devicetype；盆栽、名画勋章的 devicetype */
export const DEVICE_TYPE = { plaque: 6, pot: 36, painting: 41 } as const;

/** 厨具六项属性（生成、强化、宝石都按这个名字） */
export const EQUIP_ATTRS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const;

/** 不构成套装的 suitid：0 无套装，90 玉•xx之帽、99 铉•xx之帽（规格书 20 §20.15） */
export const NON_SUIT_IDS: ReadonlySet<number> = new Set([0, 90, 99]);
