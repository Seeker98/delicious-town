import { z } from 'zod';

/** 一番赏（一番赏设计 §5、§7） */
export const kujiBuyBody = z.object({ num: z.number().int().min(1).max(100) });
export const kujiDrawBody = z.object({ num: z.number().int().min(1).max(100) });
export interface KujiAwardDto {
  coin?: number;
  exp?: number;
  diamond?: number;
  renown?: number;
  goods?: Array<{ id: number; num: number }>;
  foods?: Array<{ id: number; num: number }>;
}
export interface KujiTierDto {
  key: string;
  count: number;
  left: number;
  award: KujiAwardDto;
  icon: string | null;
  big: boolean;
}
export interface KujiViewDto {
  pool: { id: number; day: string; seq: number; total: number; left: number };
  tiers: KujiTierDto[];
  last: { award: KujiAwardDto; icon: string | null };
  tickets: number;
  price: number;
  buyLeft: number;
  maxDraw: number;
  recent: Array<{ at: string; restName: string; tier: string }>;
}
export interface KujiDrawDto {
  draws: Array<{ tier: string; award: KujiAwardDto }>;
  last: KujiAwardDto | null;
  view: KujiViewDto;
}
