/** 街道类型（问题记录 378 方案 C）：银币街、均衡街、经验街 */
export type StreetFocus = 'coin' | 'balanced' | 'exp';

export interface WeatherDto {
  id: number;
  name: string;
  type: number;
  effects: Record<string, number>;
  note: string;
  until: string;
}

export interface WorldDto {
  weather: WeatherDto;
  krabStreet: number;
  krabStreetName: string;
  holidayMultiplier: number;
  planktonRestId: number | null;
}

export interface CatalogGoodsDto {
  id: number;
  name: string;
  type: number;
  deviceType: number | null;
  level: number;
  desc: string;
  coin: number;
  diamond: number;
  stackable: boolean;
  /** 厨具：部位、等级门槛、套装、强化一次的精华、最大孔数 */
  equip?: { part: number; minLevel: number; suitId: number; essence: number; maxHole: number };
  /** 宝石：阶数、下一阶 */
  gem?: { level: number; nextId: number | null };
}

export interface CatalogFoodDto {
  id: number;
  name: string;
  level: number;
  odds: number;
  coin: number;
  type: number | null;
}

/** 前端显示名称用的目录（道具、食材、街道、天气、设施位），按配置版本缓存 */
export interface CatalogDto {
  version: string;
  goods: CatalogGoodsDto[];
  foods: CatalogFoodDto[];
  /** desc = 街道加成说明（搬家页显示，问题记录 284） */
  /** theme：为什么是这个加成（问题记录 380）；focus：银币街、均衡街、经验街，新手街 null（问题记录 378 方案 C） */
  streets: Array<{
    id: number;
    name: string;
    cookName: string;
    desc: string;
    theme: string;
    focus: StreetFocus | null;
  }>;
  /** note 是天气效果说明（问题记录 272 起按语言；旧缓存里没有） */
  weather: Array<{ id: number; name: string; note?: string }>;
  devices: Array<{ id: number; name: string; deviceType: number; needStar: number }>;
  /** 门、头像、个性图标；旧缓存里没有 */
  looks?: LooksDto;
  /** 厨具套装；旧缓存里没有 */
  suits?: Array<{ id: number; name: string; maxNum: number; tiers: Array<{ need: number; desc: string }> }>;
  /** 特色菜；旧缓存里没有 */
  mysterious?: CatalogMcDto[];
  /** 种子；旧缓存里没有 */
  seeds?: Array<{ id: number; foodsId: number; level: number }>;
  /** 服务端接口直接给名字的数据，前端按 id 取当前语言的名字（问题记录 272）；旧缓存里没有 */
  data?: Record<CatalogDataKind, CatalogDataEntry[]>;
}

/** 任务（主线、支线、每周）、主线章节、玩法支线、活跃项、星愿、厨塔各层（id = 层）、菜园配方、一番赏主题（id = 月）、特色菜熟练度（id = 等级）、菜名 */
export const CATALOG_DATA_KINDS = [
  'tasks',
  'chapters',
  'questLines',
  'activation',
  'bless',
  'tower',
  'formulas',
  'kujiThemes',
  'proficiency',
  'cookbooks',
] as const;
export type CatalogDataKind = (typeof CATALOG_DATA_KINDS)[number];
export interface CatalogDataEntry {
  id: number;
  name: string;
  title?: string;
  note?: string;
  desc?: string;
}

export interface CatalogMcDto {
  id: number;
  name: string;
  level: number;
  road: number;
  nutritive: number;
  coin: number;
  foods: number[];
}

export interface LooksDto {
  doors: Array<{ id: number; name: string; coin: number }>;
  avatars: Array<{ id: number; name: string }>;
  icons: Array<{ key: string; title: string; desc: string }>;
}
