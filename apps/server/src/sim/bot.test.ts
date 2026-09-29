import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../test/config';
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

  it('升星只差凭证时先攒凭证的钱，不再花在餐桌、油壶和菜场上', async () => {
    const config = testConfig();
    const ids = [...config.cookbookIndex.idsByStreet.values()].flat().slice(0, 15);
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: { level: 13, coin: 50_000, oil: 1000, oil_max: 1000, table_num: 16 },
      cookbooks: Object.fromEntries(ids.map((id) => [id, 1])),
      tables,
    });
    await botTurn(t.game, { name: 'b', persona: PERSONAS[0]!, ctx });
    const r = await t.game.restaurant.overview(ctx.restaurantId);
    expect(r.tables).toHaveLength(4);
    expect(r.coin).toBeGreaterThanOrEqual(50_000);
  }, 60_000);
});
