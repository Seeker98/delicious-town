import { fileURLToPath } from 'node:url';

export const TEST_BUNDLE_PATH = fileURLToPath(new URL('../.test/bundle.json', import.meta.url));

/** 测试环境变量；CI 可以用 TEST_DATABASE_URL / TEST_REDIS_URL 覆盖 */
export const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://dt:dt@localhost:55432/dt_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:56379/0',
  CONFIG_BUNDLE_PATH: TEST_BUNDLE_PATH,
  WEB_ORIGIN: 'http://localhost:5173',
  TURNSTILE_SECRET: '',
  SMTP_URL: 'smtp://localhost:1025',
};
