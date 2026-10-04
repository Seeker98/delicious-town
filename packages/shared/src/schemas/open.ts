import { z } from 'zod';
import { localeSchema, type Locale } from '../locale';

/** 开放接口（问题记录 142）：只读的静态游戏数据，全部来自配置包，不含玩家和区服数据 */
export const openQuery = z.object({ lang: localeSchema.optional() });

/** 各接口都带配置版本和语言 */
export interface OpenMeta {
  version: string;
  lang: Locale;
}

export type OpenKind = 'goods' | 'foods' | 'cookbooks' | 'equips' | 'streets';

export interface OpenIndexDto extends OpenMeta {
  langs: Locale[];
  /** 各类数量：Wiki 首页卡片用 */
  counts: Record<OpenKind, number>;
  endpoints: string[];
}

export interface OpenGoodsBrief {
  id: number;
  name: string;
  type: number;
  level: number;
  /** 商店售价（银币 / 钻石），没有为 0 */
  coin: number;
  diamond: number;
  /** 商店常驻在售 */
  onSale: boolean;
}

/**
 * 礼包能开出的东西：只给种类和数量，不给概率（设计 §2.1）。
 * randomGoods 是某等级的随机道具，randomFoods 是某等级的随机普通食材，masterFoods 是万能食材；
 * 银币、经验、钻石是 min~max 之间的随机数（含两端）
 */
export type OpenGiftItem =
  | { kind: 'goods'; id: number; name: string; num: number }
  | { kind: 'randomGoods'; level: number; num: number }
  | { kind: 'foods'; id: number; name: string; num: number }
  | { kind: 'randomFoods'; level: number; num: number }
  | { kind: 'masterFoods'; num: number }
  | { kind: 'coin' | 'exp' | 'diamond'; min: number; max: number }
  | { kind: 'renown'; num: number };

export interface OpenExchangeRule {
  /** 换到的道具 */
  goodsId: number;
  goodsName: string;
  num: number;
  /** 用什么换 */
  need: Array<{ goodsId: number; name: string; num: number }>;
  /** 每人累计限兑次数；-1 不限 */
  times: number;
}

export interface OpenGoodsDto extends OpenMeta, OpenGoodsBrief {
  desc: string;
  stackable: boolean;
  maxNum: number;
  /** 限时道具的小时数；永久为 null */
  invalidHours: number | null;
  /** 几星可用（后期海报奖杯，问题记录 146）；没有门槛为 0 */
  needStar: number;
  equip: {
    part: number;
    minLevel: number;
    suitId: number;
    suitName: string | null;
    essence: number;
    hole: number;
    maxHole: number;
    /** 基础属性：固定值或 [下限, 上限] */
    ranges: Record<string, number | [number, number]>;
    /** 强化 +0~+10 时的属性总和 */
    stressTable: number[];
  } | null;
  /** nextName：下一阶的名字（按语言）；没有下一阶为 null */
  gem: { level: number; nextId: number | null; nextName: string | null; attrs: Record<string, number> } | null;
  gift: OpenGiftItem[] | null;
  sources: {
    shop: { coin: number; diamond: number } | null;
    renownShop: { renown: number; rotating: boolean } | null;
    exchange: OpenExchangeRule[];
  };
  /** 作为兑换材料能换什么 */
  usedIn: OpenExchangeRule[];
}

export interface OpenFoodBrief {
  id: number;
  name: string;
  level: number;
  coin: number;
  rare: boolean;
  /** 0 调料坚果 / 1 肉蛋奶 / 2 蔬果 */
  type: number | null;
}

export interface OpenFoodDto extends OpenMeta, OpenFoodBrief {
  maxNum: number;
  /** 菜园里能种出它的种子（种子名没有翻译，只给 id 和每次收获几个） */
  seed: { id: number; harvestNum: number } | null;
  /** 用到它的菜谱：最低用到的品级 */
  cookbooks: Array<{ id: number; name: string; streetId: number; grade: number }>;
  mysterious: Array<{ id: number; name: string }>;
}

export interface OpenCookbookBrief {
  id: number;
  name: string;
  streetId: number;
  /** 推荐等级 */
  level: number;
  coin: number;
}

export interface OpenCookbookDto extends OpenMeta, OpenCookbookBrief {
  taste: number[];
  /** 原数据只有简中描述，其他语言为 null */
  desc: string | null;
  /** 1~10 品级各自的食材 */
  grades: Array<{ grade: number; foods: Array<{ foodsId: number; name: string; num: number }> }>;
}

export interface OpenEquipBrief {
  id: number;
  name: string;
  part: number;
  minLevel: number;
  suitId: number;
  /** +10 时的属性总和 */
  maxTotal: number;
}

export interface OpenSuitDto {
  id: number;
  name: string;
  maxNum: number;
  tiers: Array<{ need: number; desc: string }>;
}

export interface OpenStreetDto {
  id: number;
  name: string;
  cookName: string;
  desc: string;
  medal: { id: number; name: string; desc: string } | null;
  cookbookCount: number;
}

export interface OpenListDto<T> extends OpenMeta {
  items: T[];
}

export interface OpenEquipsDto extends OpenListDto<OpenEquipBrief> {
  suits: OpenSuitDto[];
}
