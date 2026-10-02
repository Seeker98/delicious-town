import { randomInt } from 'node:crypto';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';
import {
  type AccountProfileDto,
  type ChangePasswordInput,
  ErrorCode,
  isLocale,
  type ForgotPasswordInput,
  type Locale,
  type LoginInput,
  type MeDto,
  type RegisterInput,
  type ResetPasswordInput,
} from '@dt/shared';
import { uniqueViolation } from '../../db/errors';
import type { DB } from '../../db/schema';
import type { Env } from '../../env';
import { AppError } from '../../http/errors';
import type { Captcha } from '../../infra/captcha';
import type { Mailer } from '../../infra/mailer';
import type { SessionData, SessionStore } from '../../security/sessionStore';
import { newToken, sha256 } from '../../security/tokens';
import { npcInvite } from '../npc/npc';
import { hashPassword, verifyPassword } from './password';
import { isBanned } from '../admin/ban';
import { writeAudit } from '../admin/audit';
import { invalidState } from '../../core/errors';

export interface AccountDeps {
  db: Kysely<DB>;
  redis: Redis;
  sessions: SessionStore;
  mailer: Mailer;
  captcha: Captcha;
  env: Env;
  now: () => Date;
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;
const MAIL_COOLDOWN_SECONDS = 60;

type Purpose = 'verify' | 'reset';

export function createAccountService(d: AccountDeps) {
  async function sendTokenMail(accountId: number, email: string, purpose: Purpose, silentCooldown: boolean) {
    const cooldown = await d.redis.set(
      `mailcd:${purpose}:${accountId}`,
      '1',
      'EX',
      MAIL_COOLDOWN_SECONDS,
      'NX',
    );
    if (cooldown !== 'OK') {
      if (silentCooldown) return;
      throw new AppError(ErrorCode.EMAIL_COOLDOWN, 429);
    }
    const token = newToken();
    const ttl = purpose === 'verify' ? VERIFY_TTL_MS : RESET_TTL_MS;
    await d.db
      .insertInto('email_token')
      .values({
        token_hash: sha256(token),
        account_id: accountId,
        purpose,
        expires_at: new Date(d.now().getTime() + ttl),
      })
      .execute();
    const link = `${d.env.WEB_ORIGIN}/${purpose === 'verify' ? 'verify-email' : 'reset-password'}?token=${token}`;
    await d.mailer.send(
      purpose === 'verify'
        ? {
            to: email,
            subject: '美味小镇：验证你的邮箱',
            text: `欢迎来到美味小镇！请在 24 小时内打开下面的链接完成邮箱验证：\n${link}`,
          }
        : {
            to: email,
            subject: '美味小镇：重置密码',
            text: `请在 1 小时内打开下面的链接重置密码（如果不是你本人操作，请忽略这封邮件）：\n${link}`,
          },
    );
  }

  /** 一次性令牌：未使用、未过期才有效，使用后立即作废 */
  async function consumeToken(token: string, purpose: Purpose): Promise<number> {
    const now = d.now();
    const row = await d.db
      .updateTable('email_token')
      .set({ used_at: now })
      .where('token_hash', '=', sha256(token))
      .where('purpose', '=', purpose)
      .where('used_at', 'is', null)
      .where('expires_at', '>', now)
      .returning('account_id')
      .executeTakeFirst();
    if (!row) throw new AppError(ErrorCode.TOKEN_INVALID, 400);
    return row.account_id;
  }

  return {
    async register(input: RegisterInput, ip: string): Promise<{ token: string; accountId: number }> {
      if (!(await d.captcha.verify(input.captchaToken, ip)))
        throw new AppError(ErrorCode.CAPTCHA_FAILED, 400);
      let invitedBy: number | null = null;
      if (input.inviteCode) {
        const inviter = await d.db
          .selectFrom('account')
          .select('id')
          .where('invite_code', '=', input.inviteCode.toUpperCase())
          .executeTakeFirst();
        invitedBy = inviter?.id ?? null;
      }
      const passwordHash = await hashPassword(input.password);
      let accountId: number;
      try {
        const row = await d.db
          .insertInto('account')
          .values({
            username: input.username,
            password_hash: passwordHash,
            email: input.email,
            invited_by: invitedBy,
            lang: input.lang ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        accountId = row.id;
      } catch (e) {
        const constraint = uniqueViolation(e);
        if (constraint === 'account_username_lower') throw new AppError(ErrorCode.USERNAME_TAKEN, 409);
        if (constraint === 'account_email') throw new AppError(ErrorCode.EMAIL_TAKEN, 409);
        throw e;
      }
      return { token: await d.sessions.create(accountId), accountId };
    },

    async login(input: LoginInput): Promise<{ token: string; accountId: number }> {
      const account = await d.db
        .selectFrom('account')
        .select(['id', 'password_hash', 'banned_at', 'banned_until', 'ban_reason', 'is_system'])
        .where(sql<string>`lower(username)`, '=', input.username.toLowerCase())
        .executeTakeFirst();
      const valid = await verifyPassword(account?.password_hash ?? null, input.password);
      if (!account || !valid || account.is_system) throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401);
      if (isBanned(account, d.now()))
        throw new AppError(ErrorCode.ACCOUNT_BANNED, 403, { reason: account.ban_reason });
      return { token: await d.sessions.create(account.id), accountId: account.id };
    },

    async me(accountId: number, sel: Pick<SessionData, 'shardId' | 'restaurantId'>): Promise<MeDto> {
      const a = await d.db
        .selectFrom('account')
        .select(['id', 'username', 'email', 'email_verified_at', 'role', 'lang'])
        .where('id', '=', accountId)
        .executeTakeFirst();
      if (!a) throw new AppError(ErrorCode.UNAUTHORIZED, 401);
      return {
        lang: isLocale(a.lang) ? a.lang : null,
        accountId: a.id,
        username: a.username,
        email: a.email,
        emailVerified: a.email_verified_at !== null,
        role: a.role,
        shardId: sel.shardId,
        restaurantId: sel.restaurantId,
      };
    },

    /** 设置账号语言（问题记录 272） */
    async setLang(accountId: number, lang: Locale): Promise<{ lang: Locale }> {
      await d.db.updateTable('account').set({ lang }).where('id', '=', accountId).execute();
      return { lang };
    },

    /** 我的账号（问题记录 178）：账号信息和各区服的店 */
    async profile(accountId: number): Promise<AccountProfileDto> {
      const a = await d.db
        .selectFrom('account')
        .select(['username', 'email', 'email_verified_at', 'role', 'created_at', 'invite_code'])
        .where('id', '=', accountId)
        .executeTakeFirst();
      if (!a) throw new AppError(ErrorCode.UNAUTHORIZED, 401);
      const rests = await d.db
        .selectFrom('restaurant as r')
        .innerJoin('shard as s', 's.id', 'r.shard_id')
        .select(['r.id', 'r.name', 'r.level', 's.id as shard_id', 's.name as shard_name', 's.status'])
        .where('r.account_id', '=', accountId)
        .where('r.npc', '=', false)
        .orderBy('s.id')
        .execute();
      return {
        username: a.username,
        email: a.email,
        emailVerified: a.email_verified_at !== null,
        role: a.role,
        createdAt: new Date(a.created_at).toISOString(),
        inviteCode: a.invite_code,
        rests: rests.map((r) => ({
          shardId: r.shard_id,
          shardName: r.shard_name,
          shardOpen: r.status === 'open',
          restId: r.id,
          name: r.name,
          level: r.level,
        })),
      };
    },

    /** 改密码（设计 §6.1）：旧密码不对、新旧相同都报 INVALID_STATE（不用 401，免得前端当成已退出）；会话由路由处理 */
    async changePassword(accountId: number, input: ChangePasswordInput): Promise<void> {
      const a = await d.db
        .selectFrom('account')
        .select('password_hash')
        .where('id', '=', accountId)
        .executeTakeFirstOrThrow();
      if (!(await verifyPassword(a.password_hash, input.oldPassword))) throw invalidState('wrong_password');
      if (input.oldPassword === input.newPassword) throw invalidState('same_password');
      await d.db
        .updateTable('account')
        .set({ password_hash: await hashPassword(input.newPassword) })
        .where('id', '=', accountId)
        .execute();
      await writeAudit(d.db, { actor: null, action: 'account.password', target: `account:${accountId}` });
    },

    async sendVerifyEmail(accountId: number): Promise<void> {
      const a = await d.db
        .selectFrom('account')
        .select(['email', 'email_verified_at'])
        .where('id', '=', accountId)
        .executeTakeFirst();
      if (!a || a.email_verified_at) return;
      await sendTokenMail(accountId, a.email, 'verify', false);
    },

    async verifyEmail(token: string): Promise<void> {
      const accountId = await consumeToken(token, 'verify');
      await d.db
        .updateTable('account')
        .set({ email_verified_at: d.now() })
        .where('id', '=', accountId)
        .where('email_verified_at', 'is', null)
        .execute();
      await npcInvite(d.db, { accountId });
    },

    /** 无论邮箱是否存在都返回成功，避免被用来探测注册邮箱 */
    async forgotPassword(input: ForgotPasswordInput, ip: string): Promise<void> {
      if (!(await d.captcha.verify(input.captchaToken, ip)))
        throw new AppError(ErrorCode.CAPTCHA_FAILED, 400);
      const a = await d.db
        .selectFrom('account')
        .select(['id', 'email'])
        .where('email', '=', input.email)
        .executeTakeFirst();
      if (a) await sendTokenMail(a.id, a.email, 'reset', true);
    },

    async resetPassword(input: ResetPasswordInput): Promise<void> {
      const accountId = await consumeToken(input.token, 'reset');
      await d.db
        .updateTable('account')
        .set({ password_hash: await hashPassword(input.password) })
        .where('id', '=', accountId)
        .execute();
      await d.sessions.destroyAll(accountId);
    },

    async createInviteCode(accountId: number): Promise<string> {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = Array.from({ length: 8 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join(
          '',
        );
        try {
          await d.db.updateTable('account').set({ invite_code: code }).where('id', '=', accountId).execute();
          return code;
        } catch (e) {
          if (uniqueViolation(e) === null) throw e;
        }
      }
      throw new Error('failed to generate a unique invite code');
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
