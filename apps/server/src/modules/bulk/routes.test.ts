import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('大宗认购接口（大宗认购设计 §3.2）', () => {
  it('看板能读；出价参数不对报 VALIDATION_FAILED；批次不存在报 bulk_not_open', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const v = await call(ctx.app, 'GET', '/api/v1/bulk', { cookie: p.cookie });
    expect(v.json.data).toMatchObject({ lot: null, openHour: 20 });
    const bad = await call(ctx.app, 'POST', '/api/v1/bulk/bid', {
      cookie: p.cookie,
      body: { lotId: 1, price: 1.5, qty: 1 },
    });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
    await ctx.deps.db.updateTable('restaurant').set({ level: 30 }).where('id', '=', p.restId).execute();
    const none = await call(ctx.app, 'POST', '/api/v1/bulk/bid', {
      cookie: p.cookie,
      body: { lotId: 999_999_999, price: 100, qty: 1 },
    });
    expect(none.json.code).not.toBe('NOT_FOUND');
  });
});
