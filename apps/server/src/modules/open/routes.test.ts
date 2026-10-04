import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, GENEROUS_RULES, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('开放接口（问题记录 142）', () => {
  it('不登录就能访问；带版本和语言；不存在的 id 404、语言不对 400', async () => {
    const idx = await call(ctx.app, 'GET', '/api/v1/open');
    expect(idx.status).toBe(200);
    expect(idx.json.data).toMatchObject({ version: expect.any(String), lang: 'zh-CN' });
    const goods = await call(ctx.app, 'GET', '/api/v1/open/goods?lang=en');
    expect(goods.json.data.lang).toBe('en');
    expect(goods.json.data.items.length).toBeGreaterThan(100);
    for (const url of [
      '/api/v1/open/goods/1',
      '/api/v1/open/foods/239',
      '/api/v1/open/cookbooks/1',
      '/api/v1/open/foods',
      '/api/v1/open/cookbooks',
      '/api/v1/open/equips',
      '/api/v1/open/streets',
    ])
      expect((await call(ctx.app, 'GET', url)).status, url).toBe(200);
    expect((await call(ctx.app, 'GET', '/api/v1/open/goods/51')).status).toBe(404);
    expect((await call(ctx.app, 'GET', '/api/v1/open/cookbooks/999999')).status).toBe(404);
    expect((await call(ctx.app, 'GET', '/api/v1/open/goods?lang=xx')).json.code).toBe('VALIDATION_FAILED');
  });

  it('任何网站都能跨域读（不带 cookie）；可以缓存，带同样的 ETag 回 304', async () => {
    const r = await call(ctx.app, 'GET', '/api/v1/open/streets?lang=fr', {
      headers: { origin: 'https://example.org' },
    });
    expect(r.res.headers['access-control-allow-origin']).toBe('*');
    expect(r.res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(r.res.headers['cache-control']).toBe('public, max-age=3600');
    const etag = r.res.headers.etag as string;
    expect(etag).toMatch(/^".+:fr:streets"$/);
    const again = await call(ctx.app, 'GET', '/api/v1/open/streets?lang=fr', {
      headers: { 'if-none-match': etag },
    });
    expect(again.status).toBe(304);
    // 404 也带跨域头，别的网站能读到错误码
    const miss = await call(ctx.app, 'GET', '/api/v1/open/foods/999999', {
      headers: { origin: 'https://example.org' },
    });
    expect(miss.res.headers['access-control-allow-origin']).toBe('*');
    // 本站的 Wiki 也不带 cookie 请求（getPublic），一律回 *，响应不随来源变（终审：共享缓存不会串）
    const web = ctx.deps.env.WEB_ORIGIN;
    const mine = await call(ctx.app, 'GET', '/api/v1/open/streets', { headers: { origin: web } });
    expect(mine.res.headers['access-control-allow-origin']).toBe('*');
    expect(mine.res.headers['access-control-allow-credentials']).toBeUndefined();
    // 游戏自己的接口照旧只允许本站、带 cookie
    const own = await call(ctx.app, 'GET', '/api/v1/world/catalog', {
      headers: { origin: 'https://example.org' },
    });
    expect(own.res.headers['access-control-allow-origin']).not.toBe('*');
  });
});

describe('开放接口的跨域和缓存细节（问题记录 142 终审）', () => {
  it('别的网站带 If-None-Match 等头时的预检：回 *，允许这些头；能读到 ETag', async () => {
    const pre = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/open/goods/1',
      headers: {
        origin: 'https://tool.example',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'if-none-match, content-type',
      },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('*');
    expect(pre.headers['access-control-allow-credentials']).toBeUndefined();
    expect(String(pre.headers['access-control-allow-headers']).toLowerCase()).toContain('if-none-match');
    expect(String(pre.headers['access-control-allow-methods'])).toContain('GET');
    const r = await call(ctx.app, 'GET', '/api/v1/open/goods/1', {
      headers: { origin: 'https://tool.example' },
    });
    expect(String(r.res.headers['access-control-expose-headers']).toLowerCase()).toContain('etag');
  });

  it('弱 ETag、多个 ETag 也认（CDN 重新压缩时会改成 W/）', async () => {
    const r = await call(ctx.app, 'GET', '/api/v1/open/foods');
    const etag = r.res.headers.etag as string;
    for (const h of [`W/${etag}`, `"x", ${etag}`]) {
      const again = await call(ctx.app, 'GET', '/api/v1/open/foods', { headers: { 'if-none-match': h } });
      expect(again.status, h).toBe(304);
    }
  });

  it('404 不缓存、不带 ETag；开放接口下不存在的路径也是 404 带 *', async () => {
    const miss = await call(ctx.app, 'GET', '/api/v1/open/foods/999999');
    expect(miss.status).toBe(404);
    expect(miss.res.headers.etag).toBeUndefined();
    expect(miss.res.headers['cache-control']).toBeUndefined();
    const typo = await call(ctx.app, 'GET', '/api/v1/open/gods', {
      headers: { origin: 'https://tool.example' },
    });
    expect(typo.status).toBe(404);
    expect(typo.json.code).toBe('NOT_FOUND');
    expect(typo.res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('开放接口限流', () => {
  it('按 IP 用单独的 open 规则', async () => {
    const tight = await createTestApp({
      rateRules: { ...GENEROUS_RULES, open: { capacity: 2, refillPerSec: 0.001 } },
    });
    try {
      const get = () => call(tight.app, 'GET', '/api/v1/open', { ip: '10.77.0.1' });
      expect((await get()).status).toBe(200);
      expect((await get()).status).toBe(200);
      const third = await get();
      expect(third.status).toBe(429);
      expect(third.res.headers['access-control-allow-origin']).toBe('*');
    } finally {
      await tight.close();
    }
  });
});
