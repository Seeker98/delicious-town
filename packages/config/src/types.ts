import type { GoodsUse } from './goodsUse';
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
  road: number;
  nutritive: number;
  coin: number;
  odds: number;
  taste: number[];
  foods: IdNumFood[];
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
  /** 以后子项目才用到的表：已校验引用，结构暂不规范化 */
  extra: Record<string, unknown[]>;
}

export interface Looks {
  doors: Array<{ id: number; name: string; coin: number }>;
  avatars: Array<{ id: number; name: string }>;
  icons: Array<{ key: string; title: string; desc: string }>;
}
