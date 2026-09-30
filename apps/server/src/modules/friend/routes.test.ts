import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('好友接口', () => {
  it('申请、同意、列表走通；参数不合法返回 VALIDATION_FAILED', async () => {
    const shardId = await createShard(ctx.deps.db);
    const a = await playerIn(ctx, shardId);
    const b = await playerIn(ctx, shardId);
    const r1 = await call(ctx.app, 'POST', '/api/v1/friend/apply', {
      cookie: a.cookie,
      body: { restId: b.restId },
    });
    expect(r1.json).toMatchObject({ ok: true, data: { status: 'requested' } });
    const r2 = await call(ctx.app, 'POST', '/api/v1/friend/respond', {
      cookie: b.cookie,
      body: { restId: a.restId, accept: true },
    });
    expect(r2.json.data).toEqual({ status: 'friends' });
    const list = await call(ctx.app, 'GET', '/api/v1/friend/list?sort=recent', { cookie: a.cookie });
    expect(list.json.data.items.map((x: { id: number }) => x.id)).toEqual([b.restId]);
    const bad = await call(ctx.app, 'POST', '/api/v1/friend/apply', {
      cookie: a.cookie,
      body: { restId: 'x' },
    });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
  });
});
