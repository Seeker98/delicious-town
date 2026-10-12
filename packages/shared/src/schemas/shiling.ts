import { z } from 'zod';

/** 现在的当令（天气改版设计 §3.1）：生效天气（道具盖着按盖的）当令哪几道、到几点；下一轮最可能的类型 */
export interface SeasonDto {
  /** 够星才开放（下锅才算应时） */
  open: boolean;
  minStar: number;
  weatherId: number;
  /** 当令的道：1~6，兽道是 7 */
  roads: number[];
  until: string;
  next: { at: string; type: number; p: number };
}

export type ShilingItem = 'remnant' | 'rare' | 'compass' | 'lots';

export interface ShilingShopItemDto {
  item: ShilingItem;
  /** 残卷是“每级”的单价（价格 = 菜等级 × price），其他是一个的价格 */
  price: number;
  perLevel: boolean;
  /** 罗盘、晴雨签的道具 id */
  goodsId: number | null;
  weekly: number;
  left: number;
}

export interface ShilingDto {
  season: SeasonDto;
  balance: number;
  /** 本周获得（周一 0 点起，花掉不减） */
  weekGain: number;
  /** 你会的菜里现在下锅应时的 */
  inSeason: number[];
  shop: ShilingShopItemDto[];
  /** 时令铺能选的菜：残卷是可鉴定、还没学会的 1~5 级；珍稀残卷是不能鉴定、还没学会的 */
  remnantPool: number[];
  rarePool: number[];
  /** 持有的残卷（选菜时显示“残卷 N 张”） */
  remnants: Array<{ mcId: number; num: number }>;
  /** 当令表：一行几种天气（日夜对应的合成一行，特殊天气合成一行）、当令的道；按天气类型、编号排 */
  table: Array<{ ids: number[]; roads: number[] }>;
  /** 你会的菜所在的道 */
  myRoads: number[];
  trialPick: number;
}

export const shilingBuyBody = z.object({
  item: z.enum(['remnant', 'rare', 'compass', 'lots']),
  mcId: z.number().int().positive().optional(),
});

export interface ShilingBuyResultDto {
  item: ShilingItem;
  mcId: number | null;
  balance: number;
}
