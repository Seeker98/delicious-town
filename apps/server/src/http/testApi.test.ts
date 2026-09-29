import { afterAll, describe, expect, it } from 'vitest';
import { createShard } from '../../test/fixtures';
import { call, createTestApp, testEnvWith, type TestContext } from '../../test/helpers';
import { createShiftClock } from '../infra/clock';

const contexts: TestContext[] = [];
afterAll(async () => {
  for (const c of contexts) await c.close();
});

describe('测试时钟接口', () => {
  it('推进时钟并执行到期的周期任务', async () => {
    const clock = createShiftClock();
    const ctx = await createTestApp({ env: testEnvWith({ ENABLE_TEST_API: true }), clock, now: clock.now });
    contexts.push(ctx);
    const shardId = await createShard(ctx.deps.db);
    const before = clock.now().getTime();
    const r = await call(ctx.app, 'POST', '/api/v1/test/tick', { body: { minutes: 4, shardIds: [shardId] } });
    expect(r.status).toBe(200);
    expect(new Date(r.json.data.now).getTime() - before).toBeGreaterThanOrEqual(4 * 60_000);
    expect(r.json.data.ran.map((x: { job: string }) => x.job)).toContain('settlement');
  });

  it('没有开启时不存在这个接口', async () => {
    const ctx = await createTestApp();
    contexts.push(ctx);
    const r = await call(ctx.app, 'POST', '/api/v1/test/tick', { body: { minutes: 1 } });
    expect(r.status).toBe(404);
  });

  it('生产环境不允许开启', async () => {
    const { loadEnv } = await import('../env');
    expect(() =>
      loadEnv({
        ...process.env,
        NODE_ENV: 'production',
        ENABLE_TEST_API: 'true',
        TURNSTILE_SECRET: 'x',
        COOKIE_SECURE: 'true',
      }),
    ).toThrow('ENABLE_TEST_API');
  });
});
