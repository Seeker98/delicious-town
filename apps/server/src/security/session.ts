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

export function registerSession(app: FastifyInstance, store: SessionStore): void {
  app.decorateRequest('session', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const data = await store.get(token);
    req.session = data ? { token, data } : null;
  });
}

export function setSessionCookie(reply: FastifyReply, token: string, env: Env): void {
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
