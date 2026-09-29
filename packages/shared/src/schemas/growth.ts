import { z } from 'zod';
import type { DeviceSlotDto } from './restaurant';

const points = z.number().int().min(0).max(10000);

export const allocateBody = z
  .object({ cook: points, cutting: points, fire: points })
  .refine((b) => b.cook + b.cutting + b.fire > 0, { message: 'empty' });
export const toggleBody = z.object({ on: z.boolean() });
export const cookfoodsBody = z.object({ flag: z.number().int().min(0).max(10) });
export const placeDeviceBody = z.object({
  slot: z.number().int().min(1).max(20),
  goodsId: z.number().int().positive(),
});
export const slotBody = z.object({ slot: z.number().int().min(1).max(20) });
export const renameBody = z.object({ name: z.string().max(32) });
export const moveBody = z.object({ streetId: z.number().int().min(0).max(50) });
export const drivePlanktonBody = z.object({ way: z.enum(['strength', 'book']) });

/** 与配置里的 Award 结构相同（shared 不依赖 config） */
export interface AwardDto {
  coin?: number;
  exp?: number;
  diamond?: number;
  renown?: number;
  goods?: Array<{ id: number; num: number }>;
  foods?: Array<{ id: number; num: number }>;
}

export interface NeedCheckDto {
  key: 'level' | 'star' | 'cookbooks' | 'coin' | 'goods';
  id?: number;
  need: number;
  have: number;
  ok: boolean;
}

export interface StarNeedDto {
  star: number;
  nextStar: number | null;
  /** 下一星是否在当前版本开放（泛紫星级在子项目 5） */
  available: boolean;
  checks: NeedCheckDto[];
  award: AwardDto | null;
  ok: boolean;
}

export interface OilNeedDto {
  oilLevel: number;
  oilMax: number;
  nextLevel: number | null;
  nextOilMax: number | null;
  checks: NeedCheckDto[];
  ok: boolean;
}

export interface AttrResultDto {
  attrLeft: number;
  attrs: { cook: number; cutting: number; fire: number; season: number; creatives: number };
}

export interface DeviceOptionsDto {
  slots: DeviceSlotDto[];
  /** 仓库里可以摆放的设施道具 */
  store: Array<{ goodsId: number; num: number; deviceType: number }>;
}
