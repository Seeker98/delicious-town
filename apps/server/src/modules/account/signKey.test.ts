import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  cookieOf,
  createTestApp,
  registerUser,
  testEnvWith,
  type TestContext,
} from '../../../test/helpers';
import { testConfig } from '../../../test/config';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('签名密钥接口（防脚本 2026-10-25）', () => {
  it('登录后能取到密钥和服务器时间，两次相同', async () => {
    const u = await registerUser(ctx.app);
    const a = await call(ctx.app, 'GET', '/api/v1/account/sign-key', { cookie: u.cookie });
    expect(a.status).toBe(200);
    expect(a.json.data.key).toHaveLength(43);
    expect(Number.isNaN(Date.parse(a.json.data.serverNow))).toBe(false);
    const b = await call(ctx.app, 'GET', '/api/v1/account/sign-key', { cookie: u.cookie });
    expect(b.json.data.key).toBe(a.json.data.key);
    // 密钥不能被浏览器或中间的代理缓存
    expect(a.res.headers['cache-control']).toBe('no-store');
  });

  it('没登录返回 401', async () => {
    expect((await call(ctx.app, 'GET', '/api/v1/account/sign-key')).status).toBe(401);
  });

  it('重新登录后密钥换了', async () => {
    const u = await registerUser(ctx.app);
    const a = await call(ctx.app, 'GET', '/api/v1/account/sign-key', { cookie: u.cookie });
    const login = await call(ctx.app, 'POST', '/api/v1/account/login', {
      body: { username: u.username, password: 'secret123' },
    });
    const b = await call(ctx.app, 'GET', '/api/v1/account/sign-key', { cookie: cookieOf(login.res) });
    expect(b.json.data.key).not.toBe(a.json.data.key);
  });

  it('默认设置：只记录、时间窗 120 秒、很久没人操作 60 秒；环境变量总开关默认关', () => {
    expect(testConfig().tuning.ops.antibot).toEqual({
      mode: 'log',
      skewSec: 120,
      idleMs: 60000,
      captchaEveryMin: 60,
    });
    expect(testEnvWith().ANTIBOT_FORCE_LOG).toBe(false);
  });
});
