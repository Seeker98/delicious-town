import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('后台发个性图标', () => {
  it('管理员发放、收回，写审计；协管只能看', async () => {
    const admin = await userWithRole(ctx, 'admin');
    const mod = await userWithRole(ctx, 'mod');
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const url = `/api/v1/admin/restaurants/${p.restId}/icons`;
    const g = await call(ctx.app, 'POST', url, { cookie: admin.cookie, body: { key: 'founder' } });
    expect(g.json.data).toEqual([
      expect.objectContaining({ key: 'founder', title: '开服元老', shown: false }),
    ]);
    expect((await call(ctx.app, 'POST', url, { cookie: mod.cookie, body: { key: 'helper' } })).status).toBe(
      404,
    );
    expect((await call(ctx.app, 'GET', url, { cookie: mod.cookie })).json.data).toHaveLength(1);
    const bad = await call(ctx.app, 'POST', url, { cookie: admin.cookie, body: { key: 'nope' } });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
    const id = g.json.data[0].id as number;
    const rv = await call(ctx.app, 'POST', `${url}/${id}/revoke`, { cookie: admin.cookie });
    expect(rv.json.data).toEqual([]);
    const audit = await ctx.deps.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `restaurant:${p.restId}`)
      .orderBy('id')
      .execute();
    expect(audit.map((a) => a.action)).toEqual(['restaurant.icon.grant', 'restaurant.icon.revoke']);
  });
});
