import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, GENEROUS_RULES, type TestContext } from '../../test/helpers';
import { ok } from '../http/reply';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp(
    { rateRules: { ...GENEROUS_RULES, auth: { capacity: 2, refillPerSec: 0.001 } } },
    (app) => {
      app.post('/t/login-like', { config: { rateLimit: 'auth' } }, async () => ok({}));
      app.post('/t/normal', async () => ok({}));
    },
  );
});
afterAll(() => ctx.close());

describe('限流', () => {
  it('同一 IP 超过 auth 桶容量后返回 429 RATE_LIMITED', async () => {
    const ip = '203.0.113.7';
    expect((await call(ctx.app, 'POST', '/t/login-like', { ip })).status).toBe(200);
    expect((await call(ctx.app, 'POST', '/t/login-like', { ip })).status).toBe(200);
    const third = await call(ctx.app, 'POST', '/t/login-like', { ip });
    expect(third.status).toBe(429);
    expect(third.json.code).toBe('RATE_LIMITED');
  });

  it('其他 IP 和其他规则不受影响', async () => {
    expect((await call(ctx.app, 'POST', '/t/login-like', { ip: '203.0.113.8' })).status).toBe(200);
    expect((await call(ctx.app, 'POST', '/t/normal', { ip: '203.0.113.7' })).status).toBe(200);
  });
});
