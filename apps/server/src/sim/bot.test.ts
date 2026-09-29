import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../test/game';
import { botTurn, PERSONAS } from './bot';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('机器人策略', () => {
  it('餐桌没到上限时去商店买餐桌A补满（设计文档 裁定 10：升级只提高上限）', async () => {
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, { patch: { coin: 200_000, table_num: 8 }, tables });
    await botTurn(t.game, { name: 'b', persona: PERSONAS[0]!, ctx });
    const r = await t.game.restaurant.overview(ctx.restaurantId);
    expect(r.tables).toHaveLength(8);
  }, 60_000);
});
