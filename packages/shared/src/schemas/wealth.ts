import { z } from 'zod';

/** 食材理财（理财设计 2026-10-10） */
export const wealthDepositBody = z.object({
  days: z.number().int().min(1).max(3650),
  coin: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
export type WealthDepositInput = z.infer<typeof wealthDepositBody>;

export interface WealthTermDto {
  days: number;
  /** 到期给的街市补给包和它的等级 */
  goodsId: number;
  level: number;
  /** 每 unit 银币给几个包 */
  perUnit: number;
}

export interface WealthDepositDto {
  id: number;
  coin: number;
  days: number;
  goodsId: number;
  packs: number;
  startedAt: string;
  maturesAt: string;
  mature: boolean;
  /** 现在提前取出能退多少（按现在的比例） */
  early: number;
}

export interface WealthViewDto {
  minLevel: number;
  unit: number;
  maxActive: number;
  maxTotal: number;
  earlyRate: number;
  terms: WealthTermDto[];
  /** 存着的，先到期的在前 */
  deposits: WealthDepositDto[];
  level: number;
  coin: number;
}
