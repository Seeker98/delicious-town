import type { GoodsUse } from './goodsUse';
import type { EQUIP_ATTRS } from './ids';
import type { Tuning } from './tuning';

export interface IdNum {
  id: number;
  num: number;
}

/** 奖励格式（规格书 00 §0.7） */
export interface Award {
  coin?: number;
  exp?: number;
  diamond?: number;
  renown?: number;
  goods?: IdNum[];
  foods?: IdNum[];
}

export interface Food {
  id: number;
  name: string;
  level: number;
  coin: number;
  odds: number;
  /** 0 调料坚果 / 1 肉蛋奶 / 2 蔬果，决定仙贝颜色 */
  type: number | null;
  maxNum: number;
}

export type GiftItem =
  | { type: 'goods'; id: number; num: number; rate: number; level?: number; equip?: number }
  | { type: 'foods'; num: number; rate: number; flag?: string; id?: number }
  | { type: 'coin' | 'exp' | 'diamond'; min: number; max: number; rate: number }
  | { type: 'renown'; num: number; rate: number };

export interface Goods {
  id: number;
  name: string;
  type: number;
  deviceType: number | null;
  invalidHours: number | null;
  maxNum: number;
  stackable: boolean;
  level: number;
  coin: number;
  diamond: number;
  onSale: boolean;
  awardFlag: number | null;
  desc: string;
  /** value 字段解析后的 JSON（对象 / 数组 / 数字 / null） */
  value: unknown;
  /** value 为对象时，其中的数值项 */
  effects: Record<string, number>;
  /** value 为数组时，解析成礼包项 */
  gift: GiftItem[] | null;
  /** 使用效果；null = 不能使用 */
  use: GoodsUse | null;
  /** 厨具（type 4）的定义；其他为 null */
  equip: EquipDef | null;
  /** 宝石（type 5）的定义；其他为 null */
  gem: GemDef | null;
}

export interface IdNumFood {
  foodsId: number;
  num: number;
}

export interface Cookbook {
  id: number;
  name: string;
  streetId: number;
  taste: number[];
  coin: number;
  level: number;
  desc: string;
  /** 品级 1~10 → 所需食材 */
  needFoods: Record<number, IdNumFood[]>;
}

export interface Street {
  id: number;
  name: string;
  cookName: string;
  desc: string;
}

export interface MysteriousCookbook {
  id: number;
  name: string;
  level: number;
  /** 1~6 一道~六道，7 兽 */
  road: number;
  nutritive: number;
  /** 残卷出售单价，也是学费的基数 */
  coin: number;
  odds: number;
  taste: number[];
  /** 能不能被鉴定 / 探险抽到 */
  appraisable: boolean;
  /** 所需食材 id：每批每种消耗 1 个（设计文档 裁定 1） */
  foods: number[];
}

/** 熟练度等级（规格书 20 §20.4）；curexp 为累计值，达到 expNext 升级，null = 满级 */
export interface McProficiency {
  curlevel: number;
  name: string;
  expNext: number | null;
}

/** 鉴定道具的 value（规格书 04 §4.3） */
export interface AppraiseDef {
  min: number;
  max: number;
  rate: number;
  num: number;
}

/** 教师证（devicetype 177）的 value（规格书 04 §4.7） */
export interface TeacherCertDef {
  levels: number[];
  needStrength: number;
  maxNum: number;
  lessonHour: number;
}

export interface Weather {
  id: number;
  name: string;
  daytime: number;
  type: number;
  special: boolean;
  probability: number | null;
  effects: Record<string, number>;
  note: string;
}

export interface Device {
  id: number;
  name: string;
  deviceType: number;
  needStar: number;
  note: string;
}

export interface StarNeed {
  star: number;
  name: string;
  needLevel: number;
  needCookbooks: number;
  cookbooksKind: 'learned' | 'tianzhuan';
  needCerts: number;
  needPurpleShells: number;
}

export interface StarAward {
  star: number;
  award: Award;
}

export interface OilNeed {
  level: number;
  needLevel: number;
  needStar: number;
  needCoin: number;
  needGoods: IdNum[];
  needPurpleShells: number;
  addOil: number;
  oilMax: number;
}

export interface Task {
  id: number;
  main: boolean;
  step: number;
  name: string;
  cond: { kind: 'counter' | 'state'; key: string; target: number };
  award: Award;
  href: string;
  feature: string;
}

export interface ActivationTask {
  id: number;
  name: string;
  points: number;
  limitTimes: number;
  needStar: number;
}

export interface ActivationReward {
  points: number;
  award: Award;
}

export interface RestaurantDefaults {
  level: number;
  attrLeft: number;
  strength: number;
  strengthMax: number;
  oil: number;
  oilMax: number;
  coin: number;
  diamond: number;
  cupboardNum: number;
  storeNum: number;
  foodsMaxNum: number;
  foodsLockNum: number;
  renown: number;
  streetId: number;
  tableNum: number;
  giftGoods: IdNum[];
  giftFoods: IdNum[];
}

export interface CookbookGrade {
  grade: number;
  name: string;
  atRatePerCookbook: number;
  spCoinAddRate: number;
  upgradeCoin: number;
  shellPerFood: number;
}

export interface ShopSpecialTier {
  name: string;
  discount: number;
  stock: number;
  /** 随机数落在 [from, to) 时选中这一档 */
  from: number;
  to: number;
}

export interface CollectionTier {
  count: number;
  name: string;
  effects: Record<string, number>;
}

export interface GuessAward {
  hits: number;
  award: Award;
}

export interface GuessBonus {
  minHits: number;
  award: Award;
}

export interface ActionMap {
  /** 行为键 → 活跃项名称 */
  activation: Record<string, string>;
  /** 事件键前缀 → 功能名 */
  features: Record<string, string>;
}

export interface Holidays {
  solarMultiplier: number;
  lunarMultiplier: number;
  /** MM-DD → 名称 */
  solar: Record<string, string>;
  /** 年份 → 清明 MM-DD */
  qingming: Record<string, string>;
  /** YYYY-MM-DD → 名称 */
  lunar: Record<string, string>;
}

export interface ConfigBundle {
  version: string;
  foods: Food[];
  goods: Goods[];
  cookbooks: Cookbook[];
  streets: Street[];
  mysteriousCookbooks: MysteriousCookbook[];
  mcProficiency: McProficiency[];
  seeds: Seed[];
  formulas: Formula[];
  seedExchange: SeedExchange[];
  incomeActions: IncomeAction[];
  slotAwards: SlotAward[];
  towerFloors: TowerFloor[];
  renownShop: RenownShopItem[];
  weather: Weather[];
  devices: Device[];
  starNeed: StarNeed[];
  starAward: StarAward[];
  oilNeed: OilNeed[];
  tasks: Task[];
  activationTasks: ActivationTask[];
  activationRewards: ActivationReward[];
  cookbookGrades: CookbookGrade[];
  shopSpecialTiers: ShopSpecialTier[];
  shopPools: { special: number[]; black: number[] };
  potTiers: CollectionTier[];
  paintingTiers: CollectionTier[];
  marketGuessFoods: number[];
  guessAwards: GuessAward[];
  guessBonus: GuessBonus[];
  actionMap: ActionMap;
  holidays: Holidays;
  tuning: Tuning;
  restaurantDefaults: RestaurantDefaults;
  looks: Looks;
  suits: SuitDef[];
  /** 以后子项目才用到的表：已校验引用，结构暂不规范化 */
  extra: Record<string, unknown[]>;
}

export interface Looks {
  doors: Array<{ id: number; name: string; coin: number }>;
  avatars: Array<{ id: number; name: string }>;
  icons: Array<{ key: string; title: string; desc: string }>;
}

export type EquipAttr = (typeof EQUIP_ATTRS)[number];
export type EquipAttrs = Record<EquipAttr, number>;

/** 厨具道具的 value（规格书 07 §7.7） */
export interface EquipDef {
  /** 1 铲 2 刀 3 锅 4 瓶 5 帽 */
  part: number;
  essence: number;
  hole: number;
  maxHole: number;
  minLevel: number;
  suitId: number;
  /** 有 total 时按部位顺序在范围内随机分配；null = 固定属性 */
  total: number | null;
  ranges: Record<EquipAttr, number | [number, number]>;
}

export interface GemDef {
  level: number;
  /** null = 最高阶 */
  nextId: number | null;
  attrs: EquipAttrs;
}

export interface SuitTier {
  need: number;
  desc: string;
  /** 百分比放大属性的键已改名为 cookPct / cuttingPct / firePct / seasonPct */
  effects: Record<string, number>;
}

export interface SuitDef {
  id: number;
  name: string;
  maxNum: number;
  tiers: SuitTier[];
}

/** 种子（规格书 20 §20.8）；infancy / maturity / autumn 是三个生长阶段的分钟数，harvest 是收获期分钟数 */
export interface Seed {
  id: number;
  foodsId: number;
  name: string;
  level: number;
  coin: number;
  infancy: number;
  maturity: number;
  autumn: number;
  harvest: number;
  harvestNum: number;
  odds: number;
}

/** 飞弹（devicetype 97）的 value（规格书 09 §9.1） */
export interface MissileDef {
  hitRate: number;
  crit: number;
  critRate: number;
  attack: [number, number];
}

/** 探险图（devicetype 96）的 value（规格书 09 §9.2） */
export interface MapDef {
  rate: number;
  level: [number, number];
  num: [number, number];
  mysteriousRate: number;
  needStrength: number;
}

/** 食材配方（规格书 08 §8.5）：主料从菜篮扣，辅料、添加料从橱柜扣 */
export interface Formula {
  id: number;
  name: string;
  mainFoodsId: number;
  subFoodsId: number;
  addFoodsId: number;
  resFoodsId: number;
  odds: number;
}

/** 配方精华换种子（规格书 20 §20.8）：每次花 essence 个精华换 seedNum 颗 */
export interface SeedExchange {
  seedId: number;
  seedNum: number;
  essence: number;
}

/** 动作收益（规格书 20 §20.7）；landExp 只有菜园动作有，其他为 0 */
export interface IncomeAction {
  id: number;
  name: string;
  coin: number;
  exp: number;
  landExp: number;
}

/** 老虎机奖项（dataset/bar_slot_machine_award；子项目 4C-1）。库存、过期日不做（设计文档裁定 4） */
export interface SlotAward {
  id: number;
  kind: 'empty' | 'foods' | 'goods';
  /** 食材或道具 id；空格为 null */
  itemId: number | null;
  odds: number;
  rare: boolean;
  /** 每格给几个 */
  getNum: number;
  news: boolean;
}

/** 厨塔守塔人（dataset/tower_floors；子项目 4C-2）。attrs 由构建按设计文档裁定 1 校准 */
export interface TowerFloor {
  floor: number;
  name: string;
  title: string;
  minLevel: number;
  /** 每人每天能挑战他几次 */
  maxTimes: number;
  /** 是否比拼特色菜（每天 05:58 换菜） */
  mc: boolean;
  note: string;
  attrs: EquipAttrs;
  /** attrs 算出的厨力 */
  power: number;
}

/** 声望商店（designed/renown_shop；子项目 4C-2） */
export interface RenownShopItem {
  goodsId: number;
  renown: number;
  /** 稀有品：每人限拥有 1 个 */
  rare: boolean;
  weeklyLimit: number;
  /** 0 常驻；1~4 按 ISO 周数 % 4 + 1 轮换 */
  weekGroup: number;
  /** 前置玩法（xz 仙珍、tz 天馔）；有前置的暂不上架 */
  require: string | null;
}
