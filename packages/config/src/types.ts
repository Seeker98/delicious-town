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
  restaurantDefaults: RestaurantDefaults;
  /** 以后子项目才用到的表：已校验引用，结构暂不规范化 */
  extra: Record<string, unknown[]>;
}
