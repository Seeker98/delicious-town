import { z } from 'zod';
import { localeSchema, type Locale } from '../locale';

export const USERNAME_RE = /^[A-Za-z0-9_\-一-龥]{2,9}$/;

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const password = z.string().min(6).max(64);
const token = z.string().min(16).max(128);
const captchaToken = z.string().min(1).max(4096);

export const registerBody = z.object({
  username: z.string().regex(USERNAME_RE),
  password,
  email,
  inviteCode: z.string().trim().max(16).optional(),
  captchaToken,
  /** 注册时的界面语言（问题记录 272） */
  lang: localeSchema.optional(),
});
export const loginBody = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(1).max(64),
});
export const verifyEmailBody = z.object({ token });
export const forgotPasswordBody = z.object({ email, captchaToken });
export const resetPasswordBody = z.object({ token, password });

export type RegisterInput = z.input<typeof registerBody>;
export type LoginInput = z.input<typeof loginBody>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordBody>;
export type ResetPasswordInput = z.input<typeof resetPasswordBody>;

export type AccountRole = 'player' | 'mod' | 'admin';

export interface MeDto {
  accountId: number;
  username: string;
  email: string;
  emailVerified: boolean;
  role: AccountRole;
  shardId: number | null;
  restaurantId: number | null;
  /** 账号语言（问题记录 272）；null 表示还没选过 */
  lang: Locale | null;
  /** 当前区服蟹老板餐厅的编号：网页按语言换它的店名；没选区服或区服还没有 NPC 时为 null */
  npcRestId: number | null;
}

/** 设置账号语言（问题记录 272） */
export const setLangBody = z.object({ lang: localeSchema });

/** 登录后改密码（问题记录 178） */
export const changePasswordBody = z.object({ oldPassword: z.string().min(1).max(64), newPassword: password });
export type ChangePasswordInput = z.input<typeof changePasswordBody>;

/** 我的账号（问题记录 178） */
export interface AccountProfileDto {
  username: string;
  email: string;
  emailVerified: boolean;
  role: AccountRole;
  createdAt: string;
  inviteCode: string | null;
  rests: Array<{
    shardId: number;
    shardName: string;
    shardOpen: boolean;
    restId: number;
    name: string;
    level: number;
  }>;
}
