import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { restPower } from './power';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('restPower（规格书 20 §20.18）', () => {
  it('厨力 = 五项之和 + ⌊幸运/2⌋，含穿戴的厨具', async () => {
    const ctx = await newRestaurant(t, { patch: { attr_cook: 10, attr_fire: 3, luck: 5 } });
    expect(await restPower(t.db, await restRow(t, ctx.restaurantId), t.deps.config.suits)).toBe(15);
    await t.db
      .insertInto('equip')
      .values({ rest_id: ctx.restaurantId, goods_id: gid('见习之铲'), part: 1, worn: true, base_cook: 7 })
      .execute();
    expect(await restPower(t.db, await restRow(t, ctx.restaurantId), t.deps.config.suits)).toBe(22);
  });
});
