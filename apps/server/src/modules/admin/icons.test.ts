import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';
import { grantIcon } from '../icons/grant';

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
      expect.objectContaining({ key: 'founder', title: '开服元老', shown: true, expiresAt: null }),
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

  it('有效期：领取后 N 天、到某个时间；先发 7 天再发永久变永久；时间已过报错（定制称号设计 三）', async () => {
    const admin = await userWithRole(ctx, 'admin');
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const url = `/api/v1/admin/restaurants/${p.restId}/icons`;
    const post = (body: unknown) => call(ctx.app, 'POST', url, { cookie: admin.cookie, body });
    const now = ctx.deps.now();
    const a = await post({ key: 'chef', days: 7 });
    const exp = new Date(a.json.data[0].expiresAt as string).getTime();
    expect(Math.abs(exp - (now.getTime() + 7 * 86_400_000))).toBeLessThan(60_000);
    expect((await post({ key: 'chef' })).json.data[0].expiresAt).toBeNull();
    const until = new Date(now.getTime() + 3 * 86_400_000).toISOString();
    expect((await post({ key: 'artist', until })).json.data[1].expiresAt).toBe(until);
    const past = await post({ key: 'helper', until: '2020-01-01T00:00:00Z' });
    expect(past.json.code).toBe('VALIDATION_FAILED');
  });

  it('能发定制称号，返回定制的名字；停用的不能发', async () => {
    const admin = await userWithRole(ctx, 'admin');
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const url = `/api/v1/admin/restaurants/${p.restId}/icons`;
    const [ok, off] = await ctx.deps.db
      .insertInto('custom_icon')
      .values([{ title: '老王的红烧肉' }, { title: '停用的', retired: true }])
      .returning('id')
      .execute();
    const g = await call(ctx.app, 'POST', url, { cookie: admin.cookie, body: { key: `c${ok!.id}` } });
    expect(g.json.data).toEqual([expect.objectContaining({ key: `c${ok!.id}`, title: '老王的红烧肉' })]);
    const bad = await call(ctx.app, 'POST', url, { cookie: admin.cookie, body: { key: `c${off!.id}` } });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
  });

  it('直接发称号锁店：玩家同时领邮件里的称号时，展示中的不会超过 5 个（backlog 1010）', async () => {
    const admin = await userWithRole(ctx, 'admin');
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const now = new Date();
    for (const key of ['founder', 'helper', 'tester', 'champion'])
      await grantIcon(ctx.deps.db, { restId: p.restId, key, expiresAt: null, now });
    // 模拟领邮件的事务：锁住店、发一个称号（第 5 个展示），还没提交
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let ready!: () => void;
    const started = new Promise<void>((r) => (ready = r));
    const claim = ctx.deps.db.transaction().execute(async (tx) => {
      await tx.selectFrom('restaurant').select('id').where('id', '=', p.restId).forNoKeyUpdate().execute();
      await grantIcon(tx, { restId: p.restId, key: 'artist', expiresAt: null, now });
      ready();
      await gate;
    });
    await started;
    const g = call(ctx.app, 'POST', `/api/v1/admin/restaurants/${p.restId}/icons`, {
      cookie: admin.cookie,
      body: { key: 'chef' },
    });
    await new Promise((r) => setTimeout(r, 300));
    release();
    await claim;
    expect((await g).status).toBe(200);
    const shown = await ctx.deps.db
      .selectFrom('rest_icon')
      .select('icon_key')
      .where('rest_id', '=', p.restId)
      .where('shown', '=', true)
      .execute();
    expect(shown).toHaveLength(5);
  });
});
