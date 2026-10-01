import { afterAll, describe, expect, it } from 'vitest';
import { createShard } from '../../test/fixtures';
import { call, createTestApp, registerUser, testEnvWith, type TestContext } from '../../test/helpers';
import { CLOCK_OFFSET_KEY, createShiftClock, pullOffset } from '../infra/clock';

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
    const u = await registerUser(ctx.app);
    const before = clock.now().getTime();
    const r = await call(ctx.app, 'POST', '/api/v1/test/tick', {
      cookie: u.cookie,
      body: { minutes: 4, shardIds: [shardId] },
    });
    expect(r.status).toBe(200);
    expect(new Date(r.json.data.now).getTime() - before).toBeGreaterThanOrEqual(4 * 60_000);
    expect(r.json.data.ran.map((x: { job: string }) => x.job)).toContain('settlement');
  });

  it('需要登录', async () => {
    const clock = createShiftClock();
    const ctx = await createTestApp({ env: testEnvWith({ ENABLE_TEST_API: true }), clock, now: clock.now });
    contexts.push(ctx);
    const r = await call(ctx.app, 'POST', '/api/v1/test/tick', { body: { minutes: 1 } });
    expect(r.status).toBe(401);
  });

  it('推进后的偏移写进 Redis，worker 等其他进程的时钟拉取后一致', async () => {
    const clock = createShiftClock();
    const ctx = await createTestApp({ env: testEnvWith({ ENABLE_TEST_API: true }), clock, now: clock.now });
    contexts.push(ctx);
    await ctx.deps.redis.del(CLOCK_OFFSET_KEY);
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', '/api/v1/test/tick', {
      cookie: u.cookie,
      body: { minutes: 7, shardIds: [] },
    });
    expect(r.status).toBe(200);
    const other = createShiftClock();
    await pullOffset(other, ctx.deps.redis);
    expect(other.offset()).toBe(clock.offset());
    expect(other.offset()).toBeGreaterThanOrEqual(7 * 60_000);
    await ctx.deps.redis.del(CLOCK_OFFSET_KEY);
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

describe('测试接口：设定嘻哈男孩的地点（4E-2）', () => {
  it('把今天的地点设到指定位置；需要登录', async () => {
    const clock = createShiftClock();
    const ctx = await createTestApp({ env: testEnvWith({ ENABLE_TEST_API: true }), clock, now: clock.now });
    contexts.push(ctx);
    const shardId = await createShard(ctx.deps.db);
    expect((await call(ctx.app, 'POST', '/api/v1/test/hiphop', { body: { shardId, place: 1 } })).status).toBe(
      401,
    );
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', '/api/v1/test/hiphop', {
      cookie: u.cookie,
      body: { shardId, place: 5 },
    });
    expect(r.status).toBe(200);
    const row = await ctx.deps.db
      .selectFrom('hiphop_day')
      .select(['place', 'rest_id'])
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ place: 5, rest_id: null });
  });
});
