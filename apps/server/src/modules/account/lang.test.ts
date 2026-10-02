import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uniqueName } from '../../../test/fixtures';
import { call, cookieOf, createTestApp, registerUser, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const A = '/api/v1/account';
const me = async (cookie: string) => (await call(ctx.app, 'GET', `${A}/me`, { cookie })).json.data;

describe('账号语言（问题记录 272）', () => {
  it('注册时带语言就记在账号上；不带是 null（还没选过）', async () => {
    const r = await call(ctx.app, 'POST', `${A}/register`, {
      body: {
        username: uniqueName('l'),
        password: 'secret123',
        email: `${uniqueName('e')}@test.local`,
        captchaToken: 't',
        lang: 'fr',
      },
    });
    expect(r.status).toBe(200);
    expect((await me(cookieOf(r.res))).lang).toBe('fr');
    const u = await registerUser(ctx.app);
    expect((await me(u.cookie)).lang).toBeNull();
  });

  it('设置语言：合法的保存；不支持的语言 400，原值不变；没登录 401', async () => {
    const u = await registerUser(ctx.app);
    const ok = await call(ctx.app, 'POST', `${A}/lang`, { cookie: u.cookie, body: { lang: 'es' } });
    expect(ok.status).toBe(200);
    expect(ok.json.data).toEqual({ lang: 'es' });
    expect((await me(u.cookie)).lang).toBe('es');
    const bad = await call(ctx.app, 'POST', `${A}/lang`, { cookie: u.cookie, body: { lang: 'de' } });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe('VALIDATION_FAILED');
    expect((await me(u.cookie)).lang).toBe('es');
    const anon = await call(ctx.app, 'POST', `${A}/lang`, { body: { lang: 'en' } });
    expect(anon.status).toBe(401);
  });
});
