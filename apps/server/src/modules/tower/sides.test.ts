import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { sideOf } from './sides';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('对决属性里的套装进攻加成', () => {
  it('古尔图格 5 件：主动挑战时厨艺 +5%，被挑战时不加', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 60, attr_cook: 100 } });
    for (const goodsId of [
      gid('意志之古尔图格的精华之铲'),
      gid('意志之古尔图格的精华之刃'),
      gid('意志之古尔图格的精华之镬'),
      gid('意志之古尔图格的精华之瓶'),
      gid('意志之古尔图格的精华之冠'),
    ]) {
      const def = t.deps.config.requireGoods(goodsId).equip!;
      await t.db
        .insertInto('equip')
        .values({
          rest_id: ctx.restaurantId,
          goods_id: goodsId,
          part: def.part,
          suit_id: def.suitId,
          min_level: def.minLevel,
          cur_hole: def.hole,
          max_hole: def.maxHole,
          worn: true,
        })
        .execute();
    }
    const rest = await restRow(t, ctx.restaurantId);
    const attack = await sideOf(t.db, t.deps.config, rest, 0, 'attack');
    const defend = await sideOf(t.db, t.deps.config, rest, 0, 'defend');
    expect(defend.attrs.cook).toBe(100);
    expect(attack.attrs.cook).toBe(105);
  });
});
