import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-09-30', 12)));

describe('声望商店（设计文档 §3.5）', () => {
  it('本周在售：美味券、四五级食材随机券（雕像 2026-11-21 下架）', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 123 } });
    const v = await t.game.tower.shop(ctx);
    expect(v.renown).toBe(123);
    expect(v.items).toEqual([
      { goodsId: GOODS.dtTicket, renown: 60, weeklyLimit: 10, bought: 0, rare: false, owned: false },
      // 问题记录 505：四、五级食材随机券常驻
      { goodsId: gid('四级食材随机券'), renown: 50, weeklyLimit: 3, bought: 0, rare: false, owned: false },
      { goodsId: gid('五级食材随机券'), renown: 80, weeklyLimit: 2, bought: 0, rare: false, owned: false },
    ]);
  });

  it('美味券：扣声望、发物品、计本周已兑；超过每周限兑报 LIMIT weekly；下周重新计', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 2000 } });
    expect((await t.game.tower.buy(ctx, { goodsId: GOODS.dtTicket, num: 3 })).data).toEqual({ renown: 1820 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.dtTicket)).toBe(3);
    expect((await t.game.tower.shop(ctx)).items[0]).toMatchObject({ bought: 3 });
    await expect(t.game.tower.buy(ctx, { goodsId: GOODS.dtTicket, num: 8 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'weekly', max: 10 },
    });
    t.clock.set(gameTime('2026-10-05', 12));
    expect((await t.game.tower.shop(ctx)).items[0]).toMatchObject({ goodsId: GOODS.dtTicket, bought: 0 });
    await t.game.tower.buy(ctx, { goodsId: GOODS.dtTicket, num: 8 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.dtTicket)).toBe(11);
  });

  it('本周不卖的（含下架的雕像）、要前置玩法的报 not_on_sale；声望不够报 NOT_ENOUGH，什么都不变', async () => {
    const ctx = await newRestaurant(t, { patch: { renown: 50 } });
    for (const goodsId of [gid('恰克摩尔-雕像'), gid('史前怪石-雕像'), gid('仙贝-红')])
      await expect(t.game.tower.buy(ctx, { goodsId, num: 1 })).rejects.toMatchObject({
        code: 'INVALID_STATE',
        params: { reason: 'not_on_sale' },
      });
    await expect(t.game.tower.buy(ctx, { goodsId: GOODS.dtTicket, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'renown', need: 60, have: 50 },
    });
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(50);
  });
});
