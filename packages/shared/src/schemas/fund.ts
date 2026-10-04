import { z } from 'zod';

/** 小镇发展基金（240-2） */
export const fundDepositBody = z.object({ tier: z.string().min(1).max(16) });

export interface FundDepositDto {
  tier: string;
  coin: number;
  medal: number;
  startedAt: string;
  maturesAt: string;
  mature: boolean;
  /** 到期领回、提前取出各能退多少（按现在的比例） */
  back: number;
  early: number;
}

export interface FundViewDto {
  days: number;
  returnRate: number;
  earlyRate: number;
  /** expRate 是勋章的经验加成 */
  tiers: Array<{ key: string; coin: number; back: number; medal: number; expRate: number }>;
  deposit: FundDepositDto | null;
  /** 当前银币，页面判断哪档存得起 */
  coin: number;
}
