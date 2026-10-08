import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErrorCode } from '@dt/shared';
import { call, createTestApp, testEnvWith, type TestContext } from '../test/helpers';
import { AppError } from './http/errors';
import { ok } from './http/reply';
import { parse } from './http/validate';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({}, (app) => {
    app.get('/t/boom', async () => {
      throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'x' });
    });
    app.get('/t/crash', async () => {
      throw new Error('secret detail');
    });
    app.post('/t/echo', async (req) => ok(parse(z.object({ n: z.number().int() }), req.body)));
    app.get('/t/ip', async (req) => ok({ ip: req.clientIp }));
  });
});
afterAll(() => ctx.close());

describe('框架', () => {
  it('healthz / readyz', async () => {
    expect((await call(ctx.app, 'GET', '/healthz')).json).toEqual({
      ok: true,
      data: { status: 'ok' },
      events: [],
    });
    expect((await call(ctx.app, 'GET', '/readyz')).status).toBe(200);
  });

  it('业务错误转成统一格式', async () => {
    const r = await call(ctx.app, 'GET', '/t/boom');
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ ok: false, code: 'NOT_FOUND', params: { what: 'x' } });
  });

  it('未预期的错误返回 500 INTERNAL，不泄露细节', async () => {
    const r = await call(ctx.app, 'GET', '/t/crash');
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ ok: false, code: 'INTERNAL' });
    expect(r.res.body).not.toContain('secret detail');
  });

  it('参数校验失败返回 400 VALIDATION_FAILED', async () => {
    const r = await call(ctx.app, 'POST', '/t/echo', { body: { n: 'x' } });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION_FAILED');
    expect((await call(ctx.app, 'POST', '/t/echo', { body: { n: 3 } })).json.data).toEqual({ n: 3 });
  });

  it('未知路由返回 404 NOT_FOUND', async () => {
    const r = await call(ctx.app, 'GET', '/nope');
    expect(r.status).toBe(404);
    expect(r.json.code).toBe('NOT_FOUND');
  });

  it('非 JSON 的写请求被拒绝', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/t/echo',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'n=1',
    });
    expect(r.statusCode).toBe(415);
    expect(JSON.parse(r.body).code).toBe('VALIDATION_FAILED');
  });

  it('预检结果让浏览器缓存 2 小时（性能排查 2026-10-08：没写时 Chrome 只缓存 5 秒，线上每个请求都多一次往返）', async () => {
    const pre = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/restaurant/overview',
      headers: {
        origin: ctx.deps.env.WEB_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-device-id',
      },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-max-age']).toBe('7200');
  });

  it('默认不信任 CF-Connecting-IP', async () => {
    const r = await call(ctx.app, 'GET', '/t/ip', {
      headers: { 'cf-connecting-ip': '9.9.9.9' },
      ip: '10.0.0.1',
    });
    expect(r.json.data.ip).toBe('10.0.0.1');
  });

  it('开启 TRUST_CF_HEADER 后使用 CF-Connecting-IP', async () => {
    const trusted = await createTestApp({ env: testEnvWith({ TRUST_CF_HEADER: true }) }, (app) => {
      app.get('/t/ip', async (req) => ok({ ip: req.clientIp }));
    });
    const r = await call(trusted.app, 'GET', '/t/ip', {
      headers: { 'cf-connecting-ip': '9.9.9.9' },
      ip: '10.0.0.1',
    });
    expect(r.json.data.ip).toBe('9.9.9.9');
    await trusted.close();
  });
});
