import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * 写请求带 Idempotency-Key 时：第一次执行并缓存响应 ttl 秒；重复请求直接返回缓存；
 * 还在执行中返回 409。缓存按"账号（未登录按 IP）+ 路由 + key"隔离，不同用户互不可见。
 */
export function registerIdempotency(app: FastifyInstance, redis: Redis, ttlSeconds = 600): void {
  app.decorateRequest('idempotency', null);

  app.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'POST') return;
    const header = req.headers['idempotency-key'];
    if (typeof header !== 'string' || !KEY_RE.test(header)) return;
    const owner = req.session ? `acct:${req.session.data.accountId}` : `ip:${req.clientIp}`;
    const key = `idem:${owner}:${req.routeOptions.url}:${header}`;
    if ((await redis.set(key, 'pending', 'EX', ttlSeconds, 'NX')) === 'OK') {
      req.idempotency = { key };
      return;
    }
    const stored = await redis.get(key);
    if (!stored || stored === 'pending') throw new AppError(ErrorCode.IDEMPOTENCY_IN_PROGRESS, 409);
    const { status, body } = JSON.parse(stored) as { status: number; body: string };
    reply
      .code(status)
      .header('content-type', 'application/json; charset=utf-8')
      .header('idempotent-replay', 'true');
    return reply.send(body);
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (!req.idempotency) return payload;
    const { key } = req.idempotency;
    if (reply.statusCode >= 500 || typeof payload !== 'string') await redis.del(key);
    else await redis.set(key, JSON.stringify({ status: reply.statusCode, body: payload }), 'EX', ttlSeconds);
    return payload;
  });
}
