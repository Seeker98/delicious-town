import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { grantGoods } from './grant';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('纪念品（148-2 设计 §6.2）', () => {
  it('不占仓库格：仓库满了也能领；仓库页格子数不算纪念品', async () => {
    const r = await newRestaurant(t, { patch: { store_num: 1 }, goods: { 21: 1 } });
    await grantGoods(t.db, t.deps.config, r.restaurantId, 90009, 2, new Date());
    expect(await goodsNum(t, r.restaurantId, 90009)).toBe(2);
    const view = await t.game.store.list(r, {});
    expect(view.kinds).toBe(1);
    // 仓库接口带上道具类型（问题记录 276）：前端按它分纪念品，不依赖可能过期的道具目录
    expect(view.items.find((i) => i.goodsId === 90009)).toMatchObject({
      usable: false,
      sellPrice: null,
      type: 10,
    });
  });
  it('不能卖、不能丢', async () => {
    const r = await newRestaurant(t, { goods: { 90001: 1 } });
    await expect(t.game.shop.sell(r, { goodsId: 90001, num: 1 })).rejects.toMatchObject({
      code: expect.any(String),
    });
    await expect(t.game.shop.discard(r, { goodsId: 90001 })).rejects.toMatchObject({
      params: { reason: 'not_discardable' },
    });
    expect(await goodsNum(t, r.restaurantId, 90001)).toBe(1);
  });
});
