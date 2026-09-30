import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('支线「集齐 4 株盆栽」（设计文档裁定 10）', () => {
  it('按有效盆栽勋章的种数计；过期的不算；集齐 4 株完成', async () => {
    const ctx = await newRestaurant(t, { patch: { main_task_step: 40 } });
    const side = async () => (await t.game.task.tasks(ctx)).side.find((x) => x.id === 120)!;
    expect(await side()).toMatchObject({ key: 'honor.potCount', progress: 0, done: false });
    const now = new Date();
    for (const id of [248, 249, 254]) await grantGoods(t.db, config, ctx.restaurantId, id, 1, now);
    // 两小时前拿到、有效期 1 小时：已过期
    await grantGoods(t.db, config, ctx.restaurantId, 338, 1, new Date(now.getTime() - 2 * 3600_000), {
      hours: 1,
    });
    expect(await side()).toMatchObject({ progress: 3, done: false });
    await grantGoods(t.db, config, ctx.restaurantId, 387, 1, now);
    expect(await side()).toMatchObject({ progress: 4, done: true });
  });
});
