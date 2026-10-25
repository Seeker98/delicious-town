import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, type TestContext } from '../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const EXPECTED = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

describe('接口的安全响应头（安全审计 M2 2026-10-25）', () => {
  it('正常响应、404、未登录的 401 都带', async () => {
    for (const path of ['/readyz', '/api/v1/no-such-route', '/api/v1/account/me']) {
      const r = await call(ctx.app, 'GET', path);
      expect(r.res.headers, path).toMatchObject(EXPECTED);
    }
  });
});
