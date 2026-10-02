import { loadGameConfig } from '@dt/config';
import type { AppDeps } from './app';
import { createDb } from './db';
import type { Env } from './env';
import { EventBus } from './events/bus';
import { disabledCaptcha, turnstileCaptcha } from './infra/captcha';
import { createShiftClock } from './infra/clock';
import { smtpMailer } from './infra/mailer';
import { createRedis } from './infra/redis';
import { setSeedSecret } from './core/seed';
import { createSessionStore } from './security/sessionStore';

export function createDeps(env: Env): AppDeps {
  setSeedSecret(env.RNG_SECRET);
  const redis = createRedis(env.REDIS_URL);
  const clock = env.ENABLE_TEST_API ? createShiftClock() : undefined;
  return {
    env,
    db: createDb(env.DATABASE_URL, env.DB_POOL_SIZE),
    redis,
    config: loadGameConfig(env.CONFIG_BUNDLE_PATH),
    mailer: smtpMailer(env.SMTP_URL, env.MAIL_FROM),
    captcha: env.TURNSTILE_SECRET ? turnstileCaptcha(env.TURNSTILE_SECRET) : disabledCaptcha(),
    bus: new EventBus(),
    sessions: createSessionStore(redis, env.SESSION_TTL_DAYS * 86400),
    now: clock ? clock.now : () => new Date(),
    clock,
  };
}
