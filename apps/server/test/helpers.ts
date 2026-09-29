import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { loadGameConfig, type GameConfig } from '@dt/config';
import { buildApp, type AppDeps } from '../src/app';
import { createDb } from '../src/db';
import { loadEnv, type Env } from '../src/env';
import { EventBus } from '../src/events/bus';
import { fixedCaptcha } from '../src/infra/captcha';
import { memoryMailer, type MemoryMailer } from '../src/infra/mailer';
import { createRedis } from '../src/infra/redis';
import type { RateRule, RateRuleName } from '../src/security/rateLimiter';
import { createSessionStore } from '../src/security/sessionStore';
import { uniqueName } from './fixtures';

/** 测试默认放宽限流，只有限流测试自己收紧 */
export const GENEROUS_RULES: Record<RateRuleName, RateRule> = {
  default: { capacity: 100_000, refillPerSec: 100_000 },
  auth: { capacity: 100_000, refillPerSec: 100_000 },
  email: { capacity: 100_000, refillPerSec: 100_000 },
};

let config: GameConfig | null = null;
export function testConfig(): GameConfig {
  config ??= loadGameConfig(process.env.CONFIG_BUNDLE_PATH!);
  return config;
}

export function testEnvWith(patch: Partial<Env> = {}): Env {
  return { ...loadEnv(process.env), ...patch };
}

export interface TestContext {
  app: FastifyInstance;
  deps: AppDeps;
  mailer: MemoryMailer;
  close(): Promise<void>;
}

export async function createTestApp(
  overrides: Partial<AppDeps> = {},
  extend?: (app: FastifyInstance) => void,
): Promise<TestContext> {
  const env = overrides.env ?? testEnvWith();
  const db = createDb(env.DATABASE_URL, 5);
  const redis = createRedis(env.REDIS_URL);
  const mailer = memoryMailer();
  const deps: AppDeps = {
    env,
    db,
    redis,
    config: testConfig(),
    mailer,
    captcha: fixedCaptcha(true),
    bus: new EventBus(),
    sessions: createSessionStore(redis, 3600),
    now: () => new Date(),
    rateRules: GENEROUS_RULES,
    ...overrides,
  };
  const app = await buildApp(deps, extend);
  await app.ready();
  return {
    app,
    deps,
    mailer: (overrides.mailer as MemoryMailer | undefined) ?? mailer,
    close: async () => {
      await app.close();
      await db.destroy();
      redis.disconnect();
    },
  };
}

export interface CallOptions {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
  ip?: string;
}

export async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  opts: CallOptions = {},
): Promise<{ status: number; json: any; res: LightMyRequestResponse }> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  let payload: string | undefined;
  if (method === 'POST') {
    headers['content-type'] ??= 'application/json';
    payload = JSON.stringify(opts.body ?? {});
  }
  const res = await app.inject({ method, url, headers, payload, remoteAddress: opts.ip ?? '127.0.0.1' });
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, res };
}

/** 从响应里取出 "dt_sid=..."，可直接作为 cookie 请求头 */
export function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const found = list.find((c) => c.startsWith('dt_sid='));
  if (!found) throw new Error('no dt_sid cookie in response');
  return found.split(';')[0]!;
}

export async function registerUser(
  app: FastifyInstance,
  opts: { username?: string; password?: string; ip?: string } = {},
): Promise<{ username: string; email: string; cookie: string; accountId: number }> {
  const username = opts.username ?? uniqueName('u');
  const email = `${uniqueName('m')}@test.local`;
  const r = await call(app, 'POST', '/api/v1/account/register', {
    body: { username, password: opts.password ?? 'secret123', email, captchaToken: 't' },
    ip: opts.ip,
  });
  if (r.status !== 200) throw new Error(`register failed: ${r.res.body}`);
  return { username, email, cookie: cookieOf(r.res), accountId: r.json.data.accountId as number };
}

/** 从邮件正文里取出链接中的 token */
export function tokenFromMail(text: string): string {
  const m = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error('no token in mail');
  return m[1]!;
}
