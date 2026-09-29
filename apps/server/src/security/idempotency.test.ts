import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, type TestContext } from '../../test/helpers';
import { ok } from '../http/reply';
import { requireAccount } from './session';

let ctx: TestContext;
let counter = 0;
beforeAll(async () => {
  ctx = await createTestApp({}, (app) => {
    app.post('/t/count', async () => ok({ n: ++counter }));
    app.post('/t/slow', async () => {
      await new Promise((r) => setTimeout(r, 200));
      return ok({ n: ++counter });
    });
    app.post('/t/mine', async (req) => ok({ accountId: requireAccount(req).data.accountId }));
  });
});
afterAll(() => ctx.close());
const newKey = () => `k${Math.random().toString(36).slice(2, 12)}`;

describe('幂等', () => {
  it('同一个 key 重复提交只执行一次，返回相同结果', async () => {
    const key = newKey();
    const before = counter;
    const a = await call(ctx.app, 'POST', '/t/count', { headers: { 'idempotency-key': key } });
    const b = await call(ctx.app, 'POST', '/t/count', { headers: { 'idempotency-key': key } });
    expect(counter).toBe(before + 1);
    expect(b.json).toEqual(a.json);
    expect(b.res.headers['idempotent-replay']).toBe('true');
  });

  it('执行中的重复请求返回 409', async () => {
    const key = newKey();
    const [x, y] = await Promise.all([
      call(ctx.app, 'POST', '/t/slow', { headers: { 'idempotency-key': key } }),
      call(ctx.app, 'POST', '/t/slow', { headers: { 'idempotency-key': key } }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it('不同用户使用相同 key 互不影响，不会拿到别人的响应', async () => {
    const key = newKey();
    const a = await ctx.deps.sessions.create(5001);
    const b = await ctx.deps.sessions.create(5002);
    const ra = await call(ctx.app, 'POST', '/t/mine', {
      cookie: `dt_sid=${a}`,
      headers: { 'idempotency-key': key },
    });
    const rb = await call(ctx.app, 'POST', '/t/mine', {
      cookie: `dt_sid=${b}`,
      headers: { 'idempotency-key': key },
    });
    expect(ra.json.data.accountId).toBe(5001);
    expect(rb.json.data.accountId).toBe(5002);
  });

  it('没带 key 或 key 格式不对时不做幂等', async () => {
    const before = counter;
    await call(ctx.app, 'POST', '/t/count');
    await call(ctx.app, 'POST', '/t/count', { headers: { 'idempotency-key': 'bad key!' } });
    expect(counter).toBe(before + 2);
  });
});
