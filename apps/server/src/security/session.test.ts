import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, type TestContext } from '../../test/helpers';
import { ok } from '../http/reply';
import { requireAccount, requireRestaurant } from './session';

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
