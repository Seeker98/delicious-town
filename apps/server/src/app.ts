import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { Rng } from '@dt/shared';
import type { DB } from './db/schema';
import type { Env } from './env';
import type { EventBus } from './events/bus';
import { createGame } from './game';
import { registerClientIp } from './http/clientIp';
import { registerErrorHandling } from './http/errorHandling';
import { registerHealth } from './http/health';
import { subscribeSettings } from './infra/settingsBus';
import { testApiRoutes } from './http/testApi';
import type { Captcha } from './infra/captcha';
import type { ShiftClock } from './infra/clock';
import type { Mailer } from './infra/mailer';
import { registerModules } from './modules';
import { registerIdempotency } from './security/idempotency';
import { registerRateLimit } from './security/rateLimit';
import {
  createRateLimiter,
  DEFAULT_RATE_RULES,
  scaleRules,
  type RateRule,
  type RateRuleName,
} from './security/rateLimiter';
import { registerSession } from './security/session';
import type { SessionStore } from './security/sessionStore';

export interface AppDeps {
  env: Env;
  db: Kysely<DB>;
  redis: Redis;
  config: GameConfig;
  mailer: Mailer;
  captcha: Captcha;
  bus: EventBus;
  sessions: SessionStore;
  now: () => Date;
  rateRules?: Partial<Record<RateRuleName, RateRule>>;
  /** 每个操作取一个随机源；默认 cryptoRng，模拟器注入可复现的种子 */
  rng?: () => Rng;
  /** 可推进的时钟（ENABLE_TEST_API 时由 createDeps 提供） */
  clock?: ShiftClock;
}

/** 组装应用。钩子顺序：Cookie → 真实 IP → 会话 → 限流 → 幂等 → 业务路由 */
export async function buildApp(
  deps: AppDeps,
  extend?: (app: FastifyInstance) => void,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.env.NODE_ENV === 'test' ? false : { level: deps.env.LOG_LEVEL },
    bodyLimit: 64 * 1024,
  });
  await app.register(cookie);
  await app.register(cors, { origin: deps.env.WEB_ORIGIN, credentials: true, methods: ['GET', 'POST'] });
  registerClientIp(app, deps.env.TRUST_CF_HEADER);
  registerErrorHandling(app);
  registerSession(app, deps.sessions);
  registerRateLimit(
    app,
    createRateLimiter(deps.redis),
    scaleRules({ ...DEFAULT_RATE_RULES, ...deps.rateRules }, deps.env.RATE_LIMIT_SCALE),
  );
  registerIdempotency(app, deps.redis);
  registerHealth(app, deps);
  const game = createGame(deps);
  const settingsSub = subscribeSettings(deps.env.REDIS_URL, (id) => game.shards.invalidate(id));
  app.addHook('onClose', async () => settingsSub.close());
  registerModules(app, game);
  if (deps.env.ENABLE_TEST_API && deps.clock) {
    app.register(testApiRoutes(game, deps.clock), { prefix: '/api/v1/test' });
  }
  extend?.(app);
  return app;
}
