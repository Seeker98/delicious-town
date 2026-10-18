import { z } from 'zod';

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

/** 天气四大类：1 晴、2 雨、3 雪冰、4 风沙雾 */
export type WeatherTypeKey = '1' | '2' | '3' | '4';

/** 道具盖着的天气（天气改版设计 §2）：谁用什么盖的、到几点；底下的自然天气照常变 */
export interface WeatherCoverDto {
  goodsId: number;
  byRestId: number | null;
  byName: string | null;
  until: string;
  /** 底下的自然天气 */
  natural: { id: number; name: string };
}

/** 预报（设计 §1.6）：下一轮几点、各大类的概率（只给四类，不给具体天气） */
export interface WeatherForecastDto {
  at: string;
  types: Record<WeatherTypeKey, number>;
  /** 一天的换天时间（整点）、现在这一轮是几点开始的；旧服务端没有 */
  hours?: number[];
  current?: number;
}

export interface WorldDto {
  /** 现在生效的天气（盖着时是盖的那个） */
  weather: WeatherDto;
  /** 旧服务端没有下面两项 */
  cover?: WeatherCoverDto | null;
  forecast?: WeatherForecastDto;
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
  /** 单个道具的配图（界面改版 P9）：网页画 goods-<art>；不写就按小类给图 */
  art?: string;
}

export interface CatalogFoodDto {
  id: number;
  name: string;
  level: number;
  odds: number;
  coin: number;
  type: number | null;
  /** 配图类别（界面改版 P4）：网页画 food-<art>；旧服务端没有 */
  art?: string;
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
  /** type 大类、special 特殊天气（天气改版：天气页按它画图）；旧缓存没有 */
  weather: Array<{ id: number; name: string; note?: string; type?: number; special?: boolean }>;
  devices: Array<{ id: number; name: string; deviceType: number; needStar: number }>;
  /** 门、头像、个性图标；旧缓存里没有 */
  looks?: LooksDto;
  /** 厨具套装；旧缓存里没有 */
  suits?: Array<{ id: number; name: string; maxNum: number; tiers: Array<{ need: number; desc: string }> }>;
  /** 特色菜；旧缓存里没有 */
  mysterious?: CatalogMcDto[];
  /** 服务端接口直接给名字的数据，前端按 id 取当前语言的名字（问题记录 272）；旧缓存里没有 */
  data?: Record<CatalogDataKind, CatalogDataEntry[]>;
  /** 成就线和奖杯（成就系统 2026-10-19）；旧缓存里没有 */
  achievements?: CatalogAchLineDto[];
  trophies?: CatalogTrophyDto[];
}

/** 成就线：菜系线按街道展开（streetId 不是 null，名字用街道的菜系名）；labels 是各档显示名 */
export interface CatalogAchLineDto {
  key: string;
  cat: string;
  name: string;
  desc: string;
  streetId: number | null;
  labels: string[] | null;
  tiers: Array<{
    id: string;
    tier: number;
    n: number;
    pts: number;
    metric: string;
    trophy: string | null;
    icon: string | null;
  }>;
}
/** 奖杯：tone 是底色；菜系奖杯（streetId 不是 null）名字是街道菜系名 + name */
export interface CatalogTrophyDto {
  key: string;
  name: string;
  tone: 'bronze' | 'silver' | 'gold' | 'rainbow';
  streetId: number | null;
}

/** 任务（主线、支线、每周）、主线章节、玩法支线、活跃项、厨塔各层（id = 层）、一番赏主题（id = 月）、特色菜熟练度（id = 等级）、菜名 */
export const CATALOG_DATA_KINDS = [
  'tasks',
  'chapters',
  'questLines',
  'activation',
  'tower',
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
  /** 能鉴定出来（碎片兑换只能换这些，问题记录 415） */
  appraisable: boolean;
}

export interface LooksDto {
  /** art：门的图形名，网页画 door-<art>（界面改版 P3） */
  doors: Array<{ id: number; name: string; coin: number; art: string }>;
  /** art：头像的图形名，网页画 avatar-<art>（界面改版 P7） */
  avatars: Array<{ id: number; name: string; art: string }>;
  icons: Array<{ key: string; title: string; desc: string }>;
}

/** 司天罗盘、晴雨签（天气改版设计 §2） */
export const compassBody = z.object({ type: z.number().int().min(1).max(4) });
export const lotsPickBody = z.object({ index: z.number().int().min(0).max(1) });

export interface WeatherToolsDto {
  /** 服务器现在的时间（倒计时按它对时） */
  now: string;
  /** 持有几个 */
  compass: number;
  lots: number;
  compassGoodsId: number;
  lotsGoodsId: number;
  /** 我的冷却结束时间（两件共用） */
  readyAt: string | null;
  /** 别人盖着天气、或者别人摇了签还没选：这个时间以前谁都不能改 */
  lockedUntil: string | null;
  /** 我摇出来还没选的两支签 */
  pendingLots: { choices: number[]; until: string } | null;
  /** 司天罗盘四类各能换出哪些天气、概率多少；选不了的类是空数组 */
  compassOptions: Array<{ type: number; weathers: Array<{ id: number; p: number }> }>;
  /** 每人冷却几小时、盖多久（分钟）、签多久不选按第一支（秒）：规则说明按它写 */
  cooldownHours: number;
  coverMinutes: number;
  lotsSec: number;
}

export interface WeatherToolResultDto {
  from: number;
  to: number;
  until: string;
}

export interface LotsDrawDto {
  choices: number[];
  until: string;
}
