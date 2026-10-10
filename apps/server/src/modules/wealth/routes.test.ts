import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('食材理财接口（理财设计 §3.3）', () => {
  it('看板、存入、提前取出；金额不是整数报 VALIDATION_FAILED；还没到期不能领', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    await ctx.deps.db
      .updateTable('restaurant')
      .set({ coin: 3_000_000, level: 20 })
      .where('id', '=', p.restId)
      .execute();
    const v = await call(ctx.app, 'GET', '/api/v1/wealth', { cookie: p.cookie });
    expect(v.json.data).toMatchObject({ minLevel: 20, deposits: [], coin: 3_000_000 });
    expect(v.json.data.terms).toHaveLength(3);
    const bad = await call(ctx.app, 'POST', '/api/v1/wealth/deposit', {
      cookie: p.cookie,
      body: { days: 3, coin: 1.5 },
    });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
    const dep = await call(ctx.app, 'POST', '/api/v1/wealth/deposit', {
      cookie: p.cookie,
      body: { days: 3, coin: 1_000_000 },
    });
    expect(dep.json.data).toMatchObject({ coin: 2_000_000, deposits: [{ coin: 1_000_000, packs: 1 }] });
    const id = dep.json.data.deposits[0].id as number;
    const claim = await call(ctx.app, 'POST', `/api/v1/wealth/${id}/claim`, { cookie: p.cookie });
    expect(claim.json.code).toBe('INVALID_STATE');
    const w = await call(ctx.app, 'POST', `/api/v1/wealth/${id}/withdraw`, { cookie: p.cookie });
    expect(w.json.data).toMatchObject({ coin: 2_950_000, deposits: [] });
    const badId = await call(ctx.app, 'POST', '/api/v1/wealth/abc/claim', { cookie: p.cookie });
    expect(badId.json.code).toBe('VALIDATION_FAILED');
  });
});
