import { z } from 'zod';

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
}
