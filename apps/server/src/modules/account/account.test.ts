import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedCaptcha } from '../../infra/captcha';
import { uniqueName } from '../../../test/fixtures';
import {
  call,
  cookieOf,
  createTestApp,
  registerUser,
  tokenFromMail,
  type TestContext,
} from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const A = '/api/v1/account';

describe('注册', () => {
  it('成功：返回 me、写入 Cookie、发出验证邮件', async () => {
    const username = uniqueName('r');
    const email = `${uniqueName('e')}@test.local`;
    const r = await call(ctx.app, 'POST', `${A}/register`, {
      body: { username, password: 'secret123', email: email.toUpperCase(), captchaToken: 't' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({
      username,
      email,
      emailVerified: false,
      shardId: null,
      restaurantId: null,
    });
    const cookie = cookieOf(r.res);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie })).json.data.username).toBe(username);
    const mail = ctx.mailer.lastTo(email)!;
    expect(mail.text).toContain('http://localhost:5173/verify-email?token=');
  });

  it('中文用户名可以注册和登录', async () => {
    const username = `厨神${uniqueName('').slice(0, 4)}`;
    await registerUser(ctx.app, { username });
    const r = await call(ctx.app, 'POST', `${A}/login`, { body: { username, password: 'secret123' } });
    expect(r.status).toBe(200);
  });

  it('用户名查重不区分大小写；邮箱不能重复', async () => {
    const base = uniqueName('C').slice(0, 7);
    const first = await registerUser(ctx.app, { username: `${base}Ab` });
    const dupName = await call(ctx.app, 'POST', `${A}/register`, {
      body: {
        username: `${base}aB`,
        password: 'secret123',
        email: `${uniqueName('x')}@test.local`,
        captchaToken: 't',
      },
    });
    expect(dupName.status).toBe(409);
    expect(dupName.json.code).toBe('USERNAME_TAKEN');
    const dupEmail = await call(ctx.app, 'POST', `${A}/register`, {
      body: { username: uniqueName('y'), password: 'secret123', email: first.email, captchaToken: 't' },
    });
    expect(dupEmail.json.code).toBe('EMAIL_TAKEN');
  });

  it('人机验证失败', async () => {
    const strict = await createTestApp({ captcha: fixedCaptcha(false) });
    const r = await call(strict.app, 'POST', `${A}/register`, {
      body: {
        username: uniqueName('z'),
        password: 'secret123',
        email: `${uniqueName('z')}@t.local`,
        captchaToken: 't',
      },
    });
    expect(r.json.code).toBe('CAPTCHA_FAILED');
    await strict.close();
  });

  it('参数不合法', async () => {
    const r = await call(ctx.app, 'POST', `${A}/register`, {
      body: { username: 'a', password: '1', email: 'bad', captchaToken: 't' },
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION_FAILED');
  });
});

describe('登录与会话', () => {
  it('密码错误或用户不存在都返回 INVALID_CREDENTIALS', async () => {
    const u = await registerUser(ctx.app);
    const wrong = await call(ctx.app, 'POST', `${A}/login`, {
      body: { username: u.username, password: 'nope-nope' },
    });
    expect(wrong.status).toBe(401);
    expect(wrong.json.code).toBe('INVALID_CREDENTIALS');
    const ghost = await call(ctx.app, 'POST', `${A}/login`, {
      body: { username: 'ghost_x', password: 'secret123' },
    });
    expect(ghost.json.code).toBe('INVALID_CREDENTIALS');
  });

  it('用户名大小写不同也能登录；新登录使旧会话失效', async () => {
    const u = await registerUser(ctx.app, { username: `Up${uniqueName('').slice(0, 6)}` });
    const r = await call(ctx.app, 'POST', `${A}/login`, {
      body: { username: u.username.toLowerCase(), password: 'secret123' },
    });
    expect(r.status).toBe(200);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: u.cookie })).status).toBe(401);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: cookieOf(r.res) })).status).toBe(200);
  });

  it('封禁账号不能登录', async () => {
    const u = await registerUser(ctx.app);
    await ctx.deps.db
      .updateTable('account')
      .set({ banned_at: new Date() })
      .where('id', '=', u.accountId)
      .execute();
    const r = await call(ctx.app, 'POST', `${A}/login`, {
      body: { username: u.username, password: 'secret123' },
    });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('ACCOUNT_BANNED');
  });

  it('登出后会话失效', async () => {
    const u = await registerUser(ctx.app);
    expect((await call(ctx.app, 'POST', `${A}/logout`, { cookie: u.cookie })).status).toBe(200);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: u.cookie })).status).toBe(401);
  });
});

describe('邮箱验证', () => {
  it('打开链接后 emailVerified=true，链接不能重复使用', async () => {
    const u = await registerUser(ctx.app);
    const token = tokenFromMail(ctx.mailer.lastTo(u.email)!.text);
    expect((await call(ctx.app, 'POST', `${A}/verify-email`, { body: { token } })).status).toBe(200);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: u.cookie })).json.data.emailVerified).toBe(true);
    const again = await call(ctx.app, 'POST', `${A}/verify-email`, { body: { token } });
    expect(again.json.code).toBe('TOKEN_INVALID');
  });

  it('过期的链接无效', async () => {
    const u = await registerUser(ctx.app);
    const token = tokenFromMail(ctx.mailer.lastTo(u.email)!.text);
    const future = await createTestApp({ now: () => new Date(Date.now() + 25 * 3600_000) });
    const r = await call(future.app, 'POST', `${A}/verify-email`, { body: { token } });
    expect(r.json.code).toBe('TOKEN_INVALID');
    await future.close();
  });

  it('60 秒内不能重发', async () => {
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', `${A}/send-verify-email`, { cookie: u.cookie });
    expect(r.status).toBe(429);
    expect(r.json.code).toBe('EMAIL_COOLDOWN');
  });
});

describe('找回密码', () => {
  it('不存在的邮箱也返回成功，但不发信', async () => {
    const before = ctx.mailer.sent.length;
    const r = await call(ctx.app, 'POST', `${A}/forgot-password`, {
      body: { email: 'nobody@nowhere.local', captchaToken: 't' },
    });
    expect(r.status).toBe(200);
    expect(ctx.mailer.sent.length).toBe(before);
  });

  it('重置后旧会话失效，新密码可登录，旧密码不行', async () => {
    const u = await registerUser(ctx.app);
    await call(ctx.app, 'POST', `${A}/forgot-password`, { body: { email: u.email, captchaToken: 't' } });
    const mail = ctx.mailer.lastTo(u.email)!;
    expect(mail.text).toContain('/reset-password?token=');
    const token = tokenFromMail(mail.text);
    expect(
      (await call(ctx.app, 'POST', `${A}/reset-password`, { body: { token, password: 'newpass456' } }))
        .status,
    ).toBe(200);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: u.cookie })).status).toBe(401);
    const oldPw = await call(ctx.app, 'POST', `${A}/login`, {
      body: { username: u.username, password: 'secret123' },
    });
    expect(oldPw.json.code).toBe('INVALID_CREDENTIALS');
    const newPw = await call(ctx.app, 'POST', `${A}/login`, {
      body: { username: u.username, password: 'newpass456' },
    });
    expect(newPw.status).toBe(200);
  });
});

describe('邀请码', () => {
  it('生成 8 位邀请码，被邀请人注册时记录邀请关系；无效邀请码被忽略', async () => {
    const inviter = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', `${A}/invite-code`, { cookie: inviter.cookie });
    const code = r.json.data.inviteCode as string;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const invitee = await call(ctx.app, 'POST', `${A}/register`, {
      body: {
        username: uniqueName('i'),
        password: 'secret123',
        email: `${uniqueName('i')}@t.local`,
        inviteCode: code.toLowerCase(),
        captchaToken: 't',
      },
    });
    const row = await ctx.deps.db
      .selectFrom('account')
      .select('invited_by')
      .where('id', '=', invitee.json.data.accountId)
      .executeTakeFirstOrThrow();
    expect(row.invited_by).toBe(inviter.accountId);

    const bogus = await call(ctx.app, 'POST', `${A}/register`, {
      body: {
        username: uniqueName('j'),
        password: 'secret123',
        email: `${uniqueName('j')}@t.local`,
        inviteCode: 'ZZZZZZZZ',
        captchaToken: 't',
      },
    });
    expect(bogus.status).toBe(200);
  });
});
describe('角色和封禁原因', () => {
  it('me 返回角色，默认 player', async () => {
    const u = await registerUser(ctx.app);
    const me = await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie });
    expect(me.json.data.role).toBe('player');
  });

  it('被封的账号登录时带出封禁原因', async () => {
    const u = await registerUser(ctx.app);
    await ctx.deps.db
      .updateTable('account')
      .set({ banned_at: new Date(), ban_reason: '刷分' })
      .where('id', '=', u.accountId)
      .execute();
    const r = await call(ctx.app, 'POST', '/api/v1/account/login', {
      body: { username: u.username, password: 'secret123' },
    });
    expect(r.status).toBe(403);
    expect(r.json).toMatchObject({ code: 'ACCOUNT_BANNED', params: { reason: '刷分' } });
  });
});

describe('登录记录（子项目 6B-2）', () => {
  it('注册、登录时写入 login_trace：IP 和设备', async () => {
    const u = await registerUser(ctx.app, { ip: '10.77.0.1' });
    const rows = () =>
      ctx.deps.db.selectFrom('login_trace').selectAll().where('account_id', '=', u.accountId).execute();
    expect((await rows()).map((r) => r.ip)).toEqual(['10.77.0.1']);
    await call(ctx.app, 'POST', `${A}/login`, {
      body: { username: u.username, password: 'secret123' },
      ip: '10.77.0.1',
      headers: { 'x-device-id': 'dev-12345678' },
    });
    expect((await rows()).map((r) => r.device_id).sort()).toEqual(['dev-12345678', null]);
  });
});
