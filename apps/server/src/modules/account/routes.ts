import type { FastifyPluginAsync } from 'fastify';
import {
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  registerBody,
  resetPasswordBody,
  verifyEmailBody,
} from '@dt/shared';
import type { FastifyRequest } from 'fastify';
import type { AppDeps } from '../../app';
import { deviceIdOf } from '../../core/deps';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { clearSessionCookie, requireAccount, setSessionCookie } from '../../security/session';
import { recordLogin } from './loginTrace';
import type { AccountService } from './service';

export function accountRoutes(svc: AccountService, deps: AppDeps): FastifyPluginAsync {
  const noSelection = { shardId: null, restaurantId: null };
  /** 登录记录（子项目 6B-2）：写失败不影响登录 */
  const trace = (req: FastifyRequest, accountId: number) =>
    recordLogin(deps.db, accountId, req.clientIp, deviceIdOf(req)).catch((err: unknown) =>
      req.log.warn({ err }, 'record login failed'),
    );
  return async (r) => {
    r.post('/register', { config: { rateLimit: 'auth' } }, async (req, reply) => {
      const { token, accountId } = await svc.register(parse(registerBody, req.body), req.clientIp);
      setSessionCookie(reply, token, deps.env);
      await trace(req, accountId);
      try {
        await svc.sendVerifyEmail(accountId);
      } catch (err) {
        req.log.warn({ err }, 'failed to send verify mail');
      }
      return ok(await svc.me(accountId, noSelection));
    });

    r.post('/login', { config: { rateLimit: 'auth' } }, async (req, reply) => {
      const { token, accountId } = await svc.login(parse(loginBody, req.body));
      setSessionCookie(reply, token, deps.env);
      await trace(req, accountId);
      return ok(await svc.me(accountId, noSelection));
    });

    r.post('/logout', async (req, reply) => {
      if (req.session) await deps.sessions.destroy(req.session.token);
      clearSessionCookie(reply, deps.env);
      return ok({});
    });

    r.get('/me', async (req) => {
      const s = requireAccount(req);
      return ok(await svc.me(s.data.accountId, s.data));
    });

    r.get('/profile', async (req) => ok(await svc.profile(requireAccount(req).data.accountId)));

    /** 改密码：其他设备下线；本机换一个新会话，保留选的区服（设计 §6.1） */
    r.post('/change-password', { config: { rateLimit: 'auth' } }, async (req, reply) => {
      const s = requireAccount(req);
      await svc.changePassword(s.data.accountId, parse(changePasswordBody, req.body));
      await deps.sessions.destroyAll(s.data.accountId);
      const token = await deps.sessions.create(s.data.accountId);
      await deps.sessions.update(token, { shardId: s.data.shardId, restaurantId: s.data.restaurantId });
      setSessionCookie(reply, token, deps.env);
      return ok({});
    });

    r.post('/send-verify-email', { config: { rateLimit: 'email' } }, async (req) => {
      await svc.sendVerifyEmail(requireAccount(req).data.accountId);
      return ok({});
    });

    r.post('/verify-email', { config: { rateLimit: 'auth' } }, async (req) => {
      await svc.verifyEmail(parse(verifyEmailBody, req.body).token);
      return ok({});
    });

    r.post('/forgot-password', { config: { rateLimit: 'email' } }, async (req) => {
      await svc.forgotPassword(parse(forgotPasswordBody, req.body), req.clientIp);
      return ok({});
    });

    r.post('/reset-password', { config: { rateLimit: 'auth' } }, async (req) => {
      await svc.resetPassword(parse(resetPasswordBody, req.body));
      return ok({});
    });

    r.post('/invite-code', async (req) => {
      return ok({ inviteCode: await svc.createInviteCode(requireAccount(req).data.accountId) });
    });
  };
}
