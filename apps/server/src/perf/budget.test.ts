import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../test/helpers';
import { playerIn } from '../../test/players';
import { queryCounter } from '../../test/queries';

/**
 * 常用接口的查询条数预算（质量期 ③）：新开的店、没有活动的区服，第二次请求（进程内缓存已填好）最多几条查询。
 * 改功能让条数变多时这里会挂：先想想能不能并进已有的查询，确实需要再调预算
 */
const BUDGET: Record<string, number> = {
  '/account/me': 1,
  '/restaurant/overview': 11,
  '/task/list': 5,
  '/task/activation': 3,
  '/activities/summary': 2,
  '/town': 10,
  '/kuji': 9,
  '/market/view': 9,
  '/bar': 10,
  '/temple': 9,
  '/exchange/me': 7,
  '/cupboard/list': 5,
  '/store/list': 4,
  '/mail/unread': 2,
  '/world/catalog': 0,
};

const q = queryCounter();
let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({ db: q.db });
});
afterAll(async () => {
  await ctx.close();
});

describe('常用接口的查询条数（质量期 ③）', () => {
  it.each(Object.entries(BUDGET))('%s 不超过 %i 条', async (path, max) => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    await call(ctx.app, 'GET', '/api/v1' + path, { cookie: p.cookie });
    const { n, result } = await q.count(() => call(ctx.app, 'GET', '/api/v1' + path, { cookie: p.cookie }));
    expect(result.status).toBe(200);
    expect(n).toBeLessThanOrEqual(max);
  });
});
