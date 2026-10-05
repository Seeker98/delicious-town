import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { GOODS } from '@dt/config';
import { testConfig } from '../../../test/config';
import { registerErrorHandling } from '../../http/errorHandling';
import { createOpenData } from './data';
import { openRoutes } from './routes';
import { call, createTestApp, GENEROUS_RULES, type TestContext } from '../../../test/helpers';
import { cid, fid, gid } from '../../../test/items';

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
      `/api/v1/open/goods/${GOODS.mysteryTicket}`,
      `/api/v1/open/foods/${fid('猪肉')}`,
      `/api/v1/open/cookbooks/${cid('南煎丸子')}`,
      '/api/v1/open/foods',
      '/api/v1/open/cookbooks',
      '/api/v1/open/equips',
      '/api/v1/open/streets',
    ])
      expect((await call(ctx.app, 'GET', url)).status, url).toBe(200);
    expect((await call(ctx.app, 'GET', `/api/v1/open/goods/${gid('开发测试礼包')}`)).status).toBe(404);
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
      url: `/api/v1/open/goods/${GOODS.mysteryTicket}`,
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
    const r = await call(ctx.app, 'GET', `/api/v1/open/goods/${GOODS.mysteryTicket}`, {
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

describe('开放接口的缓存（质量期 ③）', () => {
  it('详情只留最近用过的若干条（爬一遍不会把内存撑大）；列表不受影响；缓存的正文和直接算的一样', async () => {
    const data = createOpenData(testConfig());
    const detail = vi.spyOn(data, 'goodsDetail');
    const list = vi.spyOn(data, 'goods');
    const app = Fastify();
    registerErrorHandling(app);
    await app.register(openRoutes(data, 'v', { detailMax: 2 }), { prefix: '/open' });
    const get = async (url: string) => (await app.inject({ method: 'GET', url })).json();
    const first = await get(`/open/goods/${GOODS.mysteryTicket}`);
    expect(first.data).toEqual(JSON.parse(JSON.stringify(data.goodsDetail('zh-CN', GOODS.mysteryTicket))));
    detail.mockClear();
    const [b, c] = [GOODS.moveCard, gid('小扩容卡')];
    await get(`/open/goods/${b}`);
    await get(`/open/goods/${c}`);
    await get(`/open/goods/${c}`);
    await get('/open/goods');
    await get('/open/goods');
    expect(detail.mock.calls.map((x) => x[1])).toEqual([b, c]);
    expect(list).toHaveBeenCalledTimes(1);
    // 第一件已经被挤出去，再读要重新算
    await get(`/open/goods/${GOODS.mysteryTicket}`);
    expect(detail.mock.calls.map((x) => x[1])).toEqual([b, c, GOODS.mysteryTicket]);
    await app.close();
  });
});

describe('开放接口：旧编号跳到新编号（重新编号，设计 §5）', () => {
  const cases: Array<[string, number, () => number]> = [
    ['goods', 1, () => GOODS.mysteryTicket],
    ['foods', 101, () => fid('大米')],
    ['cookbooks', 1, () => cid('南煎丸子')],
  ];
  it.each(cases)('%s 旧编号 %i：301，查询串照带', async (kind, old, now) => {
    const r = await call(ctx.app, 'GET', `/api/v1/open/${kind}/${old}?lang=en`);
    expect(r.status).toBe(301);
    expect(r.res.headers.location).toBe(`/api/v1/open/${kind}/${now()}?lang=en`);
  });

  it('新编号照常返回；两边都没有的照常 404', async () => {
    expect((await call(ctx.app, 'GET', `/api/v1/open/goods/${GOODS.mysteryTicket}`)).status).toBe(200);
    expect((await call(ctx.app, 'GET', '/api/v1/open/goods/999999')).status).toBe(404);
  });
});
