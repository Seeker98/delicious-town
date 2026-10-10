import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('许愿树接口（许愿树设计 §3.2）', () => {
  it('看板能读；没有进行中的一轮时许愿报 wishtree_closed', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const v = await call(ctx.app, 'GET', '/api/v1/wishtree', { cookie: p.cookie });
    expect(v.json.data).toMatchObject({ round: null, hour: 20, minLevel: 10, wished: false });
    await ctx.deps.db.updateTable('restaurant').set({ level: 10 }).where('id', '=', p.restId).execute();
    const w = await call(ctx.app, 'POST', '/api/v1/wishtree/wish', { cookie: p.cookie, body: {} });
    expect(w.json).toMatchObject({ code: 'INVALID_STATE', params: { reason: 'wishtree_closed' } });
  });
});
