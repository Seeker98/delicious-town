import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { createGame } from '../../game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('任务事件处理器', () => {
  it('同一个事件总线上多次 createGame 也只注册一次，计数不会翻倍', async () => {
    createGame(t.deps);
    const ctx = await newRestaurant(t, { patch: { attr_left: 3 } });
    await t.game.growth.allocate(ctx, { cook: 1, cutting: 0, fire: 0 });
    const row = await t.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'attr.allocate')
      .executeTakeFirstOrThrow();
    expect(row.count).toBe(1);
  });
});
