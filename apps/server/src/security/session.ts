import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode } from '@dt/shared';
import type { Env } from '../env';
import { AppError } from '../http/errors';
import type { SessionData, SessionStore } from './sessionStore';

export const SESSION_COOKIE = 'dt_sid';

export interface LoadedSession {
  token: string;
  data: SessionData;
}

export interface RestaurantContext {
  session: LoadedSession;
  accountId: number;
  shardId: number;
  restaurantId: number;
}

export function registerSession(app: FastifyInstance, store: SessionStore, env?: Env): void {
  app.decorateRequest('session', null);
  app.addHook('onRequest', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const data = await store.get(token);
    req.session = data ? { token, data } : null;
    // 配了 COOKIE_DOMAIN 后，老会话（Cookie 只在 api 子域名上）下一次请求补发一次整个域名的 Cookie：
    // 网页和 API 换成同一个域名（服务器转发 Pages）后不用重新登录
    const domain = env?.COOKIE_DOMAIN;
    if (data && env && domain && data.cookieDomain !== domain) {
      setSessionCookie(reply, token, env);
      await store.update(token, { cookieDomain: domain });
    }
  });
}

/**
 * 配了 COOKIE_DOMAIN（整个域名的 Cookie）时，顺手删掉只属于当前子域名的旧 dt_sid：
 * 不然浏览器两个都带，排在前面的旧令牌失效后，重新登录也进不去（服务器转发 Pages 前的过渡）
 */
function clearHostOnly(reply: FastifyReply, env: Env): void {
  if (env.COOKIE_DOMAIN) reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function setSessionCookie(reply: FastifyReply, token: string, env: Env): void {
  clearHostOnly(reply, env);
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN,
    path: '/',
    maxAge: env.SESSION_TTL_DAYS * 86400,
  });
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  clearHostOnly(reply, env);
  reply.clearCookie(SESSION_COOKIE, { path: '/', domain: env.COOKIE_DOMAIN });
}

export function requireAccount(req: FastifyRequest): LoadedSession {
  if (!req.session) throw new AppError(ErrorCode.UNAUTHORIZED, 401);
  return req.session;
}

/** 当前选中的区服和餐厅，一律来自会话 */
export function requireRestaurant(req: FastifyRequest): RestaurantContext {
  const session = requireAccount(req);
  const { accountId, shardId, restaurantId } = session.data;
  if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
  if (restaurantId === null) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
  return { session, accountId, shardId, restaurantId };
}
