/** 代码里直接引用的道具 id（规格书 00~07、20）。改动时同步检查 data/dataset/goods.json */
export const GOODS = {
  mysteryTicket: 1, // 神秘礼券
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
  signInGift: 115, // 每日签到礼包
  krabHappy: 133, // 蟹老板（回味无穷）
  krabAngry: 134, // 蟹老板-生气
  plankton: 363, // 痞老板
  starBlessing: 364, // 星神眷顾
  krabburgerBook: 165, // 蟹黄堡秘方
  loveNecklace: 167, // 爱心项链
  adventureMap: 170, // 探险图
  krabCoin: 240, // 蟹币
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
