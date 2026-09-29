import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { createShardService } from './service';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const S = '/api/v1/shard';

describe('区服', () => {
  it('未登录不能查看', async () => {
    expect((await call(ctx.app, 'GET', `${S}/list`)).json.code).toBe('UNAUTHORIZED');
  });

  it('列表包含开放的区服和"是否已开店"', async () => {
    const shardId = await createShard(ctx.deps.db, { name: '列表服' });
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'GET', `${S}/list`, { cookie: u.cookie });
    const item = (r.json.data as Array<{ id: number }>).find((s) => s.id === shardId);
    expect(item).toMatchObject({ id: shardId, name: '列表服', status: 'open', hasRestaurant: false });
  });

  it('选择区服写入会话，me 能看到', async () => {
    const shardId = await createShard(ctx.deps.db);
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', `${S}/select`, { cookie: u.cookie, body: { shardId } });
    expect(r.json.data).toEqual({ shardId, restaurantId: null });
    const me = await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie });
    expect(me.json.data.shardId).toBe(shardId);
  });

  it('不存在的区服 / 已关闭的区服', async () => {
    const u = await registerUser(ctx.app);
    const missing = await call(ctx.app, 'POST', `${S}/select`, {
      cookie: u.cookie,
      body: { shardId: 999 },
    });
    expect(missing.status).toBe(404);
    expect(missing.json.code).toBe('SHARD_NOT_FOUND');
    const closed = await createShard(ctx.deps.db, { status: 'closed' });
    const r = await call(ctx.app, 'POST', `${S}/select`, { cookie: u.cookie, body: { shardId: closed } });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('SHARD_CLOSED');
  });

  it('区服覆盖配置：功能开关和数值', async () => {
    const shardId = await createShard(ctx.deps.db);
    await ctx.deps.db
      .insertInto('shard_config')
      .values({
        shard_id: shardId,
        override: JSON.stringify({ features: { pond: false }, restaurant: { coin: 777 } }),
      })
      .execute();
    const svc = createShardService(ctx.deps);
    const s = await svc.settings(shardId);
    expect(s.restaurant.coin).toBe(777);
    await expect(svc.ensureFeature(shardId, 'pond')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(svc.ensureFeature(shardId, 'restaurant')).resolves.toBeDefined();
  });
});
