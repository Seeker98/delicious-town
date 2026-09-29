import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const me = (cookie?: string) => call(ctx.app, 'GET', '/api/v1/admin/me', { cookie });

describe('后台权限', () => {
  it('未登录 401', async () => {
    expect((await me()).status).toBe(401);
  });

  it('普通玩家 404，不暴露后台', async () => {
    const p = await userWithRole(ctx, 'player');
    const r = await me(p.cookie);
    expect(r.status).toBe(404);
    expect(r.json.code).toBe('NOT_FOUND');
  });

  it('mod 和 admin 能看到自己的角色', async () => {
    const m = await userWithRole(ctx, 'mod');
    const a = await userWithRole(ctx, 'admin');
    expect((await me(m.cookie)).json.data).toMatchObject({ accountId: m.accountId, role: 'mod' });
    expect((await me(a.cookie)).json.data).toMatchObject({ accountId: a.accountId, role: 'admin' });
  });

  it('降级和封禁立即生效（每次请求都读库）', async () => {
    const a = await userWithRole(ctx, 'admin');
    await ctx.deps.db.updateTable('account').set({ role: 'player' }).where('id', '=', a.accountId).execute();
    expect((await me(a.cookie)).status).toBe(404);
    const b = await userWithRole(ctx, 'admin');
    await ctx.deps.db
      .updateTable('account')
      .set({ banned_at: new Date() })
      .where('id', '=', b.accountId)
      .execute();
    expect((await me(b.cookie)).status).toBe(404);
  });
});
