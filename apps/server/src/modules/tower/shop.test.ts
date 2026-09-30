import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-09-30', 12)));

describe('声望商店（设计文档 §3.5）', () => {
  it('本周在售：美味券和本周轮到的两座雕像', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 123 } });
    const v = await t.game.tower.shop(ctx);
    expect(v.renown).toBe(123);
    expect(v.items).toEqual([
      { goodsId: 310, renown: 60, weeklyLimit: 10, bought: 0, rare: false, owned: false },
      { goodsId: 397, renown: 3000, weeklyLimit: 1, bought: 0, rare: true, owned: false },
      { goodsId: 460, renown: 3000, weeklyLimit: 1, bought: 0, rare: true, owned: false },
    ]);
  });

  it('美味券：扣声望、发物品、计本周已兑；超过每周限兑报 LIMIT weekly；下周重新计', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 2000 } });
    expect((await t.game.tower.buy(ctx, { goodsId: 310, num: 3 })).data).toEqual({ renown: 1820 });
    expect(await goodsNum(t, ctx.restaurantId, 310)).toBe(3);
    expect((await t.game.tower.shop(ctx)).items[0]).toMatchObject({ bought: 3 });
    await expect(t.game.tower.buy(ctx, { goodsId: 310, num: 8 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'weekly', max: 10 },
    });
    t.clock.set(gameTime('2026-10-05', 12));
    expect((await t.game.tower.shop(ctx)).items[0]).toMatchObject({ goodsId: 310, bought: 0 });
    await t.game.tower.buy(ctx, { goodsId: 310, num: 8 });
    expect(await goodsNum(t, ctx.restaurantId, 310)).toBe(11);
  });

  it('雕像：每人只能 1 个，兑换后发新闻；已拥有报 LIMIT owned；数量不是 1 报 VALIDATION_FAILED', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 7000 } });
    await expect(t.game.tower.buy(ctx, { goodsId: 397, num: 2 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'num' },
    });
    expect((await t.game.tower.buy(ctx, { goodsId: 397, num: 1 })).data).toEqual({ renown: 4000 });
    expect(await goodsNum(t, ctx.restaurantId, 397)).toBe(1);
    expect((await t.game.tower.shop(ctx)).items[1]).toMatchObject({ goodsId: 397, owned: true, bought: 1 });
    await expect(t.game.tower.buy(ctx, { goodsId: 397, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'owned' },
    });
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(news).toEqual([{ type: 'tower.shop.rare', params: { goodsId: 397 } }]);
  });

  it('本周不卖的、要前置玩法的报 not_on_sale；声望不够报 NOT_ENOUGH，什么都不变', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 50 } });
    for (const goodsId of [402, 506])
      await expect(t.game.tower.buy(ctx, { goodsId, num: 1 })).rejects.toMatchObject({
        code: 'INVALID_STATE',
        params: { reason: 'not_on_sale' },
      });
    await expect(t.game.tower.buy(ctx, { goodsId: 310, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'renown', need: 60, have: 50 },
    });
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(50);
  });
});
