import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, type TestContext } from '../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('backlog 多语言：响应压缩', () => {
  it('道具目录这种大响应：浏览器支持 gzip 时压缩返回', async () => {
    // 压缩后的正文不是 JSON，直接用 inject 看响应头
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/world/catalog?lang=en',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(res.rawPayload).length).toBeGreaterThan(res.rawPayload.length);
  });

  it('不支持压缩时照常返回原文', async () => {
    const r = await call(ctx.app, 'GET', '/api/v1/world/catalog?lang=en');
    expect(r.res.headers['content-encoding']).toBeUndefined();
    expect(r.json.data.goods.length).toBeGreaterThan(0);
  });
});
