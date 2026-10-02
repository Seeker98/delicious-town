import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgres://a:b@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379/0',
  CONFIG_BUNDLE_PATH: '/tmp/bundle.json',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('填充默认值', () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.TRUST_CF_HEADER).toBe(false);
    expect(env.SESSION_TTL_DAYS).toBe(30);
    expect(env.COOKIE_DOMAIN).toBeUndefined();
    // 默认连接池要能容纳结算并发（tuning.settlement.concurrency 16）+ 4（docs/deploy.md）
    expect(env.DB_POOL_SIZE).toBe(20);
  });

  it('解析布尔值和空字符串', () => {
    const env = loadEnv({ ...base, COOKIE_SECURE: 'true', TRUST_CF_HEADER: 'true', COOKIE_DOMAIN: '' });
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.TRUST_CF_HEADER).toBe(true);
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it('缺少必填项时报错', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: undefined })).toThrow();
  });

  it('生产环境必须配置人机验证和安全 Cookie', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true' })).toThrow(
      'TURNSTILE_SECRET',
    );
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', TURNSTILE_SECRET: 's' })).toThrow(
      'COOKIE_SECURE',
    );
  });

  it('生产环境必须配置至少 16 位的随机种子密钥 RNG_SECRET', () => {
    const prod = { ...base, NODE_ENV: 'production', TURNSTILE_SECRET: 's', COOKIE_SECURE: 'true' };
    expect(() => loadEnv(prod)).toThrow('RNG_SECRET');
    expect(() => loadEnv({ ...prod, RNG_SECRET: 'short' })).toThrow('RNG_SECRET');
    expect(loadEnv({ ...prod, RNG_SECRET: 'a-long-enough-secret' }).RNG_SECRET).toBe('a-long-enough-secret');
    expect(loadEnv(base).RNG_SECRET).toBe('');
  });
});
