import { z } from 'zod';
import { grantItemsShape, grantNonEmpty, grantUnique, type GrantItems } from './admin';

export const HAT_NAME_MAX = 8;
export const MAIL_HATS_MAX = 5;
export const MAIL_TITLE_MAX = 40;
export const MAIL_BODY_MAX = 1000;
/** 赞助帽子档次的前缀（设计 §5）；放在 shared，服务端和前端共用 */
export const HAT_PREFIX = { jade: '玉', xuan: '铉' } as const;
export type HatTierKey = keyof typeof HAT_PREFIX;

/** 按字符计长度（emoji 算 1 个），不按 UTF-16 */
export const charLen = (s: string) => [...s].length;
export const limitedText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((s) => charLen(s) <= max, { message: 'too_long' });

const hat = z.object({
  tier: z.enum(['jade', 'xuan']),
  name: limitedText(HAT_NAME_MAX).refine((s) => !/[\r\n]/.test(s), { message: 'newline' }),
});

/** 附件 = 补偿的五项 + 命名帽子（设计 §4） */
export const rewardItems = z
  .object({ ...grantItemsShape, hats: z.array(hat).max(MAIL_HATS_MAX).optional() })
  .refine((i) => grantNonEmpty(i) || Boolean(i.hats?.length), { message: 'empty' })
  .refine(grantUnique, { message: 'duplicate' });
export type RewardItems = GrantItems & { hats?: Array<{ tier: HatTierKey; name: string }> };

export const mailIdParam = z.object({ id: z.coerce.number().int().positive() });

export const sendMailBody = z
  .object({
    scope: z.enum(['rest', 'shard', 'all']),
    shardId: z.number().int().positive().optional(),
    restId: z.number().int().positive().optional(),
    minLevel: z.number().int().min(1).optional(),
    title: limitedText(MAIL_TITLE_MAX),
    body: limitedText(MAIL_BODY_MAX),
    items: rewardItems.optional(),
  })
  .refine((b) => b.scope !== 'rest' || b.restId !== undefined, { path: ['restId'], message: 'required' })
  .refine((b) => b.scope === 'all' || b.shardId !== undefined, { path: ['shardId'], message: 'required' });
export type SendMailInput = z.infer<typeof sendMailBody>;

/**
 * 系统邮件模板（问题记录 272）：前端按语言渲染标题和正文。
 * 模板里没有正文的（系统补偿）显示原文正文；违规通知里管理员写的说明在参数里原样显示
 */
export type MailTplKey =
  | 'activity.unclaimed'
  | 'activity.rank'
  | 'grant'
  | 'invite.welcome'
  | 'invite.reward'
  | 'hat.upgrade'
  | 'report.handled'
  | 'report.rejected'
  | 'report.penalty';
export interface MailTpl {
  key: MailTplKey;
  params: Record<string, unknown>;
}

export interface MailDto {
  id: number;
  title: string;
  body: string;
  /** 系统邮件的模板；管理员写的邮件和旧邮件为 null，显示 title、body 原文 */
  tpl: MailTpl | null;
  items: RewardItems | null;
  /** admin / grant / hat / invite */
  source: string;
  createdAt: string;
  expiresAt: string;
  read: boolean;
  claimed: boolean;
  /** 领取要求的等级；为 null 或已达到时可领 */
  minLevel: number | null;
  /** 附件里有配置中已不存在的道具或食材：不能领，可以删 */
  broken: boolean;
}
export interface MailListDto {
  items: MailDto[];
  unread: number;
  /** 餐厅当前等级：判断等级门槛用，前端不必另外读餐厅（终审 I1） */
  level: number;
}
export interface MailClaimDto {
  id: number;
  items: RewardItems;
}
export interface MailClaimAllDto {
  claimed: number;
  /** 发放出错、留着没领的封数 */
  failed: number;
  items: RewardItems[];
}
export interface AdminMailDto {
  id: number;
  scope: 'rest' | 'shard' | 'all';
  shardId: number | null;
  restId: number | null;
  minLevel: number | null;
  title: string;
  body: string;
  items: RewardItems | null;
  source: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  claimedCount: number;
  actor: string | null;
}
