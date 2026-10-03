import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe('任务接口（问题记录 318）', () => {
  it('列表返回当前章；章末奖励没做完时领取报 REQUIREMENT_NOT_MET；参数不对报 VALIDATION_FAILED', async () => {
    const p = await playerIn(ctx, await createShard(ctx.deps.db));
    const list = await call(ctx.app, 'GET', '/api/v1/task/list', { cookie: p.cookie });
    expect(list.json.data.chapter).toMatchObject({ id: 1, locked: false });
    const r = await call(ctx.app, 'POST', '/api/v1/task/chapter', {
      cookie: p.cookie,
      body: { chapterId: 1 },
    });
    expect(r.json.code).toBe('REQUIREMENT_NOT_MET');
    const bad = await call(ctx.app, 'POST', '/api/v1/task/chapter', {
      cookie: p.cookie,
      body: { chapterId: 0 },
    });
    expect(bad.json.code).toBe('VALIDATION_FAILED');
  });
});
