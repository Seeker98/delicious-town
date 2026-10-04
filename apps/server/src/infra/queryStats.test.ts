import { sql } from 'kysely';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../db';
import { call, createTestApp, registerUser, testEnvWith, type TestContext } from '../../test/helpers';
import { queryHook } from './queryStats';

let ctx: TestContext | undefined;
afterEach(async () => {
  await ctx?.close();
  // createTestApp 只关它自己建的连接池，传进去的要自己关
  await ctx?.deps.db.destroy();
  ctx = undefined;
});

async function appWith(patch: Parameters<typeof testEnvWith>[0]) {
  const env = testEnvWith(patch);
  ctx = await createTestApp({ env, db: createDb(env.DATABASE_URL, 5, queryHook(env)) });
  return ctx;
}

describe('查询统计（质量期 ③）', () => {
  it('打开 DB_QUERY_STATS：响应带 Server-Timing，写明这个请求的查询条数和耗时', async () => {
    const c = await appWith({ DB_QUERY_STATS: true });
    const u = await registerUser(c.app);
    const r = await call(c.app, 'GET', '/api/v1/account/me', { cookie: u.cookie });
    const m = /^db;dur=([\d.]+);desc="(\d+) queries", app;dur=([\d.]+)$/.exec(
      String(r.res.headers['server-timing']),
    );
    expect(m).not.toBeNull();
    expect(Number(m![2])).toBeGreaterThanOrEqual(1);
  });

  it('并发的请求各数各的', async () => {
    const c = await appWith({ DB_QUERY_STATS: true });
    const u = await registerUser(c.app);
    const count = (r: Awaited<ReturnType<typeof call>>) =>
      Number(/(\d+) queries/.exec(String(r.res.headers['server-timing']))![1]);
    const solo = count(await call(c.app, 'GET', '/api/v1/account/me', { cookie: u.cookie }));
    const many = await Promise.all(
      Array.from({ length: 5 }, () => call(c.app, 'GET', '/api/v1/account/me', { cookie: u.cookie })),
    );
    expect(many.map(count)).toEqual([solo, solo, solo, solo, solo]);
  });

  it('默认关闭：没有 Server-Timing', async () => {
    const c = await appWith({});
    const r = await call(c.app, 'GET', '/api/v1/time');
    expect(r.res.headers['server-timing']).toBeUndefined();
  });

  it('DB_SLOW_MS：超过阈值的查询打一条警告，带语句和耗时', async () => {
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const env = testEnvWith({ DB_SLOW_MS: 1 });
      const db = createDb(env.DATABASE_URL, 1, queryHook(env));
      await db.selectNoFrom((eb) => eb.fn('pg_sleep', [eb.val(0.01)]).as('x')).execute();
      await db.destroy();
      const lines = warn.mock.calls.map((x) => String(x[0])).filter((s) => s.includes('slow query'));
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!)).toMatchObject({
        level: 40,
        msg: 'slow query',
        sql: expect.stringContaining('pg_sleep'),
      });
    } finally {
      warn.mockRestore();
    }
  });

  it('出错的查询也算一条（backlog 质量期 ③）', async () => {
    const sqls: string[] = [];
    const db = createDb(testEnvWith().DATABASE_URL, 1, (q) => sqls.push(q));
    try {
      await expect(sql`select * from no_such_table`.execute(db)).rejects.toThrow();
      expect(sqls).toEqual(['select * from no_such_table']);
    } finally {
      await db.destroy();
    }
  });
});
