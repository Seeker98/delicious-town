import { z } from 'zod';

/** 一番赏（一番赏设计 §5、§7） */
/** 一番赏奖池线（240-2）：普通或豪华 */
export type KujiLine = 'normal' | 'deluxe';
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
  /** 这一池的月度主题（问题记录 274） */
  theme: { month: number; name: string; desc: string } | null;
  /** 今天的池已经开满、全部抽完 */
  closedToday: boolean;
  tickets: number;
  /** 银币余额（backlog 一番赏：页面上显示，买券前能看到够不够） */
  coin: number;
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
