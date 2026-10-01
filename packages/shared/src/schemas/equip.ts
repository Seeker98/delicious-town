import { z } from 'zod';

const id = z.number().int().positive();
export const equipIdBody = z.object({ id });
export const equipIdParam = z.object({ id: z.coerce.number().int().positive() });
export const equipListQuery = z.object({ part: z.coerce.number().int().min(1).max(5).optional() });
export const stressBody = z.object({ id, stone: z.boolean().default(false) });
export const equipRollbackBody = z.object({ id, goodsId: id });
export const lockBody = z.object({ id, locked: z.boolean() });
export const inlayBody = z.object({ id, gemId: id });
export const ungemBody = z.object({ gemRowId: id });
export const equipBatchBody = z.object({
  ids: z.array(id).min(1).max(200),
  way: z.enum(['salvage', 'sell']),
});
export const gemLevelUpBody = z.object({ goodsId: id, num: z.number().int().min(1).max(99) });
export const presetSaveBody = z.object({ name: z.string().trim().min(1).max(12) });

export interface AttrsDto {
  cook: number;
  cutting: number;
  fire: number;
  season: number;
  creatives: number;
  luck: number;
}

export interface EquipGemDto {
  /** equip_gem 行 id（摘除时用） */
  id: number;
  goodsId: number;
  level: number;
  attrs: AttrsDto;
}

export interface EquipDto {
  id: number;
  goodsId: number;
  /** 1 铲 2 刀 3 锅 4 瓶 5 帽 */
  part: number;
  suitId: number;
  minLevel: number;
  /** 强化等级 0~10 */
  stress: number;
  curHole: number;
  maxHole: number;
  locked: boolean;
  worn: boolean;
  /** 所在预设的名称 */
  inPresets: string[];
  base: AttrsDto;
  /** 强化累计增量 */
  boost: AttrsDto;
  gem: AttrsDto;
  total: AttrsDto;
  gems: EquipGemDto[];
  /** 分解能得到的精华 */
  salvage: number;
  /** 出售价；不能卖为 null */
  sellPrice: number | null;
}

export interface SuitStatusDto {
  suitId: number;
  name: string;
  count: number;
  maxNum: number;
  tiers: Array<{ need: number; desc: string; active: boolean }>;
}

export interface EquipPresetDto {
  id: number;
  name: string;
  /** 下标 0~4 = 部位 1~5 的厨具 id */
  parts: Array<number | null>;
}

export interface EquipOverviewDto {
  /** 下标 0~4 = 部位 1~5 */
  worn: Array<EquipDto | null>;
  suits: SuitStatusDto[];
  attrs: { points: AttrsDto; gear: AttrsDto; total: AttrsDto; power: number };
  presets: EquipPresetDto[];
  /** 持有的厨具件数 */
  count: number;
  level: number;
}

export interface StressRateDto {
  base: number;
  luck: number;
  weather: number;
  floor: number;
  total: number;
}

export interface StressLogDto {
  stress: number;
  success: boolean;
  attr: string | null;
  val: number;
  lucky: boolean;
  floor: boolean;
  stone: boolean;
  at: string;
}

export interface EquipDetailDto {
  equip: EquipDto;
  /** 下一级成功率；已满级为 null */
  rate: StressRateDto | null;
  /** 强化一次的花费 */
  cost: { essence: number; coin: number };
  history: StressLogDto[];
  have: { essence: number; stone: number; drill: number };
  /** 持有的回退道具 */
  backItems: Array<{ goodsId: number; num: number; back: number }>;
  /** 持有的宝石（镶嵌时选） */
  gems: Array<{ goodsId: number; num: number; level: number }>;
  /** 摘除一颗宝石的银币单价（乘阶数）；现在免费（2 星以下、酸雨天）时为 0 */
  ungemCoinPerLevel: number;
}

export interface StressResultDto {
  success: boolean;
  lucky: boolean;
  floor: boolean;
  attr: string | null;
  val: number;
  stress: number;
}

export interface GemItemDto {
  goodsId: number;
  num: number;
  level: number;
  nextId: number | null;
  /** 不含幸运补救的成功率 */
  rate: number;
  attrs: AttrsDto;
}

export interface GemsDto {
  items: GemItemDto[];
  /** 失败后幸运补救的概率 */
  luckRate: number;
  strength: number;
}

export interface GemLevelUpDto {
  success: number;
  lucky: number;
  fail: number;
  exp: number;
}

export interface EquipBatchDto {
  count: number;
  essence: number;
  coin: number;
}
