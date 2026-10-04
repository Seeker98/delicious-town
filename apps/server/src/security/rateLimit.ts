import type { FastifyInstance } from 'fastify';
import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';
import type { RateLimiter, RateRule, RateRuleName } from './rateLimiter';

/** 按 IP 和（已登录时）按账号各扣一次令牌；规则名来自路由 config.rateLimit，默认 default；open 只按 IP */
export function registerRateLimit(
  app: FastifyInstance,
  limiter: RateLimiter,
  rules: Record<RateRuleName, RateRule>,
): void {
  app.addHook('preHandler', async (req) => {
    const name: RateRuleName = req.routeOptions.config?.rateLimit ?? 'default';
    const rule = rules[name];
    const keys = [`ip:${req.clientIp}:${name}`];
    // 开放接口不需要账号，只按 IP 限（问题记录 142）
    if (req.session && name !== 'open') keys.push(`acct:${req.session.data.accountId}:${name}`);
    for (const key of keys) {
      if (!(await limiter.consume(key, rule))) throw new AppError(ErrorCode.RATE_LIMITED, 429);
    }
  });
}
