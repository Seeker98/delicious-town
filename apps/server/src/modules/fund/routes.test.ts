import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('小镇发展基金接口（240-2）', () => {
  it('看板、存入、提前取出；档位为空报 VALIDATION_FAILED', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    await ctx.deps.db.updateTable('restaurant').set({ coin: 1_000_000 }).where('id', '=', p.restId).execute();
    const v = await call(ctx.app, 'GET', '/api/v1/fund', { cookie: p.cookie });
    expect(v.json.data).toMatchObject({ days: 7, deposit: null, coin: 1_000_000 });
    const bad = await call(ctx.app, 'POST', '/api/v1/fund/deposit', { cookie: p.cookie, body: { tier: '' } });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
    const dep = await call(ctx.app, 'POST', '/api/v1/fund/deposit', {
      cookie: p.cookie,
      body: { tier: 'C' },
    });
    expect(dep.json.data).toMatchObject({ deposit: { tier: 'C', coin: 1_000_000 }, coin: 0 });
    const claim = await call(ctx.app, 'POST', '/api/v1/fund/claim', { cookie: p.cookie });
    expect(claim.json.code).toBe('INVALID_STATE');
    const w = await call(ctx.app, 'POST', '/api/v1/fund/withdraw', { cookie: p.cookie });
    expect(w.json.data).toMatchObject({ deposit: null, coin: 700_000 });
  });
});
