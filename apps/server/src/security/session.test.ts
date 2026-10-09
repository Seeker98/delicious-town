import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, testEnvWith, type TestContext } from '../../test/helpers';
import { ok } from '../http/reply';
import { clearSessionCookie, requireAccount, requireRestaurant, setSessionCookie } from './session';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({}, (app) => {
    app.get('/t/whoami', async (req) => ok({ accountId: requireAccount(req).data.accountId }));
    app.get('/t/rest', async (req) => ok(requireRestaurant(req)));
  });
});
afterAll(() => ctx.close());

describe('会话插件', () => {
  it('有效 Cookie 识别出账号', async () => {
    const token = await ctx.deps.sessions.create(4242);
    const r = await call(ctx.app, 'GET', '/t/whoami', { cookie: `dt_sid=${token}` });
    expect(r.json.data.accountId).toBe(4242);
  });

  it('没有 Cookie、伪造 Cookie、超长 Cookie 都是 401 UNAUTHORIZED，不是 500', async () => {
    for (const cookie of [undefined, 'dt_sid=garbage', `dt_sid=${'x'.repeat(300)}`]) {
      const r = await call(ctx.app, 'GET', '/t/whoami', { cookie });
      expect(r.status).toBe(401);
      expect(r.json.code).toBe('UNAUTHORIZED');
    }
  });

  it('被挤掉的旧会话变成未登录', async () => {
    const old = await ctx.deps.sessions.create(4343);
    await ctx.deps.sessions.create(4343);
    expect((await call(ctx.app, 'GET', '/t/whoami', { cookie: `dt_sid=${old}` })).status).toBe(401);
  });

  it('requireRestaurant：未选区服 / 未开店', async () => {
    const token = await ctx.deps.sessions.create(4444);
    const cookie = `dt_sid=${token}`;
    expect((await call(ctx.app, 'GET', '/t/rest', { cookie })).json.code).toBe('NO_SHARD_SELECTED');
    await ctx.deps.sessions.update(token, { shardId: 1 });
    expect((await call(ctx.app, 'GET', '/t/rest', { cookie })).json.code).toBe('RESTAURANT_NOT_FOUND');
    await ctx.deps.sessions.update(token, { restaurantId: 9 });
    expect((await call(ctx.app, 'GET', '/t/rest', { cookie })).json.data).toMatchObject({
      accountId: 4444,
      shardId: 1,
      restaurantId: 9,
    });
  });
});

describe('换成同域名前：已登录的会话补发一次整个域名的 Cookie（服务器转发 Pages）', () => {
  const setCookie = (r: { res: { headers: Record<string, unknown> } }) => {
    const raw = r.res.headers['set-cookie'];
    return (Array.isArray(raw) ? raw : raw ? [raw] : []).join('\n');
  };

  it('配了 COOKIE_DOMAIN：老会话下一次请求补发带 Domain 的 Cookie，只补一次', async () => {
    const app = await createTestApp({ env: testEnvWith({ COOKIE_DOMAIN: 'delicious.test' }) }, (a) => {
      a.get('/t/whoami', async (req) => ok({ accountId: requireAccount(req).data.accountId }));
    });
    try {
      const token = await app.deps.sessions.create(4545);
      const first = await call(app.app, 'GET', '/t/whoami', { cookie: `dt_sid=${token}` });
      expect(first.json.data.accountId).toBe(4545);
      expect(setCookie(first)).toMatch(new RegExp(`dt_sid=${token};.*Domain=delicious.test`, 'i'));
      const second = await call(app.app, 'GET', '/t/whoami', { cookie: `dt_sid=${token}` });
      expect(setCookie(second)).toBe('');
      // 无效的会话不补
      expect(setCookie(await call(app.app, 'GET', '/t/whoami', { cookie: 'dt_sid=garbage' }))).toBe('');
    } finally {
      await app.close();
    }
  });

  it('没配 COOKIE_DOMAIN：不补发', async () => {
    const token = await ctx.deps.sessions.create(4646);
    const r = await call(ctx.app, 'GET', '/t/whoami', { cookie: `dt_sid=${token}` });
    expect(setCookie(r)).toBe('');
  });
});

describe('配了 COOKIE_DOMAIN 时，发、清 Cookie 都顺手删掉只属于子域名的旧 Cookie', () => {
  it('否则浏览器同时带新旧两个 dt_sid，服务器读到排在前面的旧令牌，重新登录也进不去', async () => {
    const env = testEnvWith({ COOKIE_DOMAIN: 'delicious.test' });
    const app = await createTestApp({ env }, (a) => {
      a.get('/t/set', async (_req, reply) => {
        setSessionCookie(reply, 'tok', env);
        return ok({});
      });
      a.get('/t/clear', async (_req, reply) => {
        clearSessionCookie(reply, env);
        return ok({});
      });
    });
    try {
      const list = (r: { res: { headers: Record<string, unknown> } }) => {
        const raw = r.res.headers['set-cookie'];
        return Array.isArray(raw) ? (raw as string[]) : raw ? [raw as string] : [];
      };
      const set = list(await call(app.app, 'GET', '/t/set'));
      expect(set.some((c) => /^dt_sid=tok;/.test(c) && /Domain=delicious\.test/i.test(c))).toBe(true);
      expect(
        set.some((c) => /^dt_sid=;/.test(c) && !/Domain=/i.test(c) && /Expires=Thu, 01 Jan 1970/i.test(c)),
      ).toBe(true);
      const cleared = list(await call(app.app, 'GET', '/t/clear'));
      expect(cleared.filter((c) => /^dt_sid=;/.test(c))).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});
