import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('一番赏接口的 line 参数（240-2 终审：路由漏传 line 时服务层测试发现不了）', () => {
  it('GET ?line=deluxe 看豪华池；买券、抽签的请求体带 line 走豪华池；不带是普通池；line 写错报 VALIDATION_FAILED', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    await ctx.deps.db
      .updateTable('restaurant')
      .set({ coin: 10_000_000 })
      .where('id', '=', p.restId)
      .execute();
    const dx = await call(ctx.app, 'GET', '/api/v1/kuji?line=deluxe', { cookie: p.cookie });
    expect(dx.json.data).toMatchObject({ line: 'deluxe', price: 300000, pool: { total: 20 } });
    const normal = await call(ctx.app, 'GET', '/api/v1/kuji', { cookie: p.cookie });
    expect(normal.json.data).toMatchObject({ line: 'normal', pool: { total: 80 } });

    const buy = await call(ctx.app, 'POST', '/api/v1/kuji/buy', {
      cookie: p.cookie,
      body: { num: 1, line: 'deluxe' },
    });
    expect(buy.json.data).toMatchObject({ line: 'deluxe', tickets: 1, coin: 10_000_000 - 300000 });
    const draw = await call(ctx.app, 'POST', '/api/v1/kuji/draw', {
      cookie: p.cookie,
      body: { num: 1, line: 'deluxe' },
    });
    expect(draw.json.data.view).toMatchObject({ line: 'deluxe', tickets: 0, pool: { left: 19 } });

    const bad = await call(ctx.app, 'GET', '/api/v1/kuji?line=gold', { cookie: p.cookie });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
  });
});
