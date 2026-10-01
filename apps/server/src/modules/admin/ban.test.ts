import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { isBanned } from './ban';

describe('isBanned（设计 §4）', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('没封、永久、未到期、已到期', () => {
    expect(isBanned({ banned_at: null, banned_until: null }, now)).toBe(false);
    expect(isBanned({ banned_at: now, banned_until: null }, now)).toBe(true);
    expect(isBanned({ banned_at: now, banned_until: new Date(now.getTime() + 1000) }, now)).toBe(true);
    expect(isBanned({ banned_at: now, banned_until: new Date(now.getTime() - 1000) }, now)).toBe(false);
  });
});

describe('封号期限（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
  });
  afterAll(() => ctx.close());

  it('协管封 1 天：不能登录；到期后能登录（Review Focus 3）', async () => {
    const p = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', `/api/v1/admin/players/${p.accountId}/ban`, {
      cookie: mod.cookie,
      body: { reason: '刷屏', days: 1 },
    });
    expect(r.status).toBe(200);
    const login = () =>
      call(ctx.app, 'POST', '/api/v1/account/login', {
        body: { username: p.username, password: 'secret123' },
      });
    expect((await login()).json.code).toBe('ACCOUNT_BANNED');
    await ctx.deps.db
      .updateTable('account')
      .set({ banned_until: new Date(Date.now() - 1000) })
      .where('id', '=', p.accountId)
      .execute();
    expect((await login()).status).toBe(200);
    const d = await call(ctx.app, 'GET', `/api/v1/admin/players/${p.accountId}`, { cookie: mod.cookie });
    expect(d.json.data.banned).toBe(false);
  });

  it('协管不能永封、不能解封；管理员能（Review Focus 4）', async () => {
    const p = await registerUser(ctx.app);
    const ban = (cookie: string, body: unknown) =>
      call(ctx.app, 'POST', `/api/v1/admin/players/${p.accountId}/ban`, { cookie, body });
    expect((await ban(mod.cookie, { reason: 'x', days: 0 })).status).toBe(403);
    expect((await ban(mod.cookie, { reason: 'x' })).status).toBe(403);
    expect((await ban(admin.cookie, { reason: 'x', days: 0 })).status).toBe(200);
    const row = await ctx.deps.db
      .selectFrom('account')
      .select('banned_until')
      .where('id', '=', p.accountId)
      .executeTakeFirstOrThrow();
    expect(row.banned_until).toBeNull();
    expect(
      (await call(ctx.app, 'POST', `/api/v1/admin/players/${p.accountId}/unban`, { cookie: mod.cookie }))
        .status,
    ).toBe(404);
    expect(
      (await call(ctx.app, 'POST', `/api/v1/admin/players/${p.accountId}/unban`, { cookie: admin.cookie }))
        .status,
    ).toBe(200);
  });
});
