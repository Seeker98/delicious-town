import { z } from 'zod';
import { rewardItems, type RewardItems } from './mail';

export const REDEEM_CODE_RE = /^[A-Z0-9]{4,20}$/;
const codeText = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(REDEEM_CODE_RE));

export const redeemBody = z.object({ code: codeText });
export interface RedeemResultDto {
  code: string;
  items: RewardItems;
}

const window = {
  shardId: z.number().int().positive().optional(),
  minLevel: z.number().int().min(1).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  note: z.string().trim().max(200),
  items: rewardItems,
};
const windowOk = (b: { startsAt?: string; endsAt?: string }) =>
  !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt);

export const createSharedCodeBody = z
  .object({ ...window, code: codeText.optional(), maxUses: z.number().int().min(1).optional() })
  .refine(windowOk, { path: ['endsAt'], message: 'before_start' });
export type CreateSharedCodeInput = z.infer<typeof createSharedCodeBody>;

export const createBatchBody = z
  .object({ ...window, count: z.number().int().min(1).max(1000) })
  .refine(windowOk, { path: ['endsAt'], message: 'before_start' });
export type CreateBatchInput = z.infer<typeof createBatchBody>;

export interface AdminCodeDto {
  id: number;
  kind: 'shared' | 'single';
  /** 批次合成一行时为 null */
  code: string | null;
  batchId: number | null;
  count: number;
  usedCount: number;
  maxUses: number | null;
  items: RewardItems;
  shardId: number | null;
  minLevel: number | null;
  startsAt: string | null;
  endsAt: string | null;
  note: string;
  disabled: boolean;
  actor: string | null;
  createdAt: string;
}

/** 指引页的新手码（问题记录 150）：off = 不存在、已停用或被手动码占用；领过的码停用后仍是 used */
export interface GuideCodeDto {
  code: string;
  minLevel: number;
  items: RewardItems;
  state: 'ok' | 'level' | 'used' | 'off';
}
