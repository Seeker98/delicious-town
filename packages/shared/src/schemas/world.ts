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
  streets: Array<{ id: number; name: string; cookName: string }>;
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
