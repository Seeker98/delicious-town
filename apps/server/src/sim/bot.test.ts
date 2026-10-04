import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, latestSlot } from '@dt/shared';
import { GOODS } from '@dt/config';
import { testConfig } from '../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../test/game';
import { botTurn, PERSONAS } from './bot';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const marketSpent = async (restId: number) =>
  (
    await t.db
      .selectFrom('ledger')
      .select('delta')
      .where('rest_id', '=', restId)
      .where('source', '=', 'market.buy')
      .where('kind', '=', 'coin')
      .execute()
  ).length;

describe('机器人策略', () => {
  it('餐桌没到上限时去商店买餐桌A补满（设计文档 裁定 10：升级只提高上限）', async () => {
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, { patch: { coin: 200_000, table_num: 8 }, tables });
    await botTurn(t.game, { name: 'b', persona: PERSONAS[0]!, ctx });
    const r = await t.game.restaurant.overview(ctx.restaurantId);
    // 任务奖励可能当场升级、提高上限（问题记录 318 第 1 章任务一次能领好几个）：补满到领奖后的上限
    expect(r.tableNum).toBeGreaterThanOrEqual(8);
    expect(r.tables).toHaveLength(r.tableNum);
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
    // 签到礼包随机给银币，凑够了就会当场买凭证升星；否则钱必须原样攒着
    if (r.starLevel === 0) {
      expect(r.tables).toHaveLength(4);
      expect(await marketSpent(ctx.restaurantId)).toBe(0);
    } else expect(r.starLevel).toBe(1);
  }, 60_000);

  it('扩油壶只差银币时先攒钱，不再花在餐桌和菜场上（油壶小会在夜里断油停业）', async () => {
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: {
        level: 15,
        star_level: 1,
        oil_level: 2,
        coin: 60_000,
        oil: 2500,
        oil_max: 2500,
        table_num: 18,
      },
      tables,
    });
    await botTurn(t.game, { name: 'b', persona: PERSONAS[0]!, ctx });
    const r = await t.game.restaurant.overview(ctx.restaurantId);
    expect(r.tables).toHaveLength(4);
    expect(await marketSpent(ctx.restaurantId)).toBe(0);
  }, 60_000);

  it('只买本街的菜还缺的食材（问题记录 312：只能学本街的菜）：本街都学过了就不去菜场', async () => {
    const config = testConfig();
    const ids = config.cookbookIndex.idsByStreet.get(0)!;
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: { level: 20, star_level: 1, coin: 5_000_000, oil: 9000, oil_max: 9000, table_num: 4 },
      cookbooks: Object.fromEntries(ids.map((id) => [id, 1])),
      tables,
    });
    // 菜场上货（测试库里没有定时任务）
    const now = gameTime('2026-09-30', 10);
    t.clock.set(now);
    await t.game.market.refresh(ctx.shardId, 0, latestSlot(now, [10]), now);
    t.clock.set(new Date(now.getTime() + 60 * 60_000));
    expect((await t.game.market.view(ctx)).daily.length).toBeGreaterThan(0);
    await botTurn(t.game, { name: 'b', persona: PERSONAS[0]!, ctx });
    expect(await marketSpent(ctx.restaurantId)).toBe(0);
  }, 60_000);

  it('搬街（和快速模型同一规则）：下一星还差食谱数、本街没学过的菜学完了，就用搬家卡搬到没学过的菜最多的街', async () => {
    const config = testConfig();
    const ids = config.cookbookIndex.idsByStreet.get(0)!;
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: { level: 30, star_level: 1, coin: 5_000_000, oil: 9000, oil_max: 9000, table_num: 4 },
      cookbooks: Object.fromEntries(ids.map((id) => [id, 1])),
      goods: { [GOODS.moveCard]: 1 },
      tables,
    });
    await botTurn(t.game, { name: 'b', persona: PERSONAS[0]!, ctx });
    const r = await t.game.restaurant.overview(ctx.restaurantId);
    const most = Math.max(
      ...[...config.cookbookIndex.idsByStreet].filter(([id]) => id !== 0).map(([, x]) => x.length),
    );
    expect(config.cookbookIndex.idsByStreet.get(r.streetId)!.length).toBe(most);
  }, 60_000);

  it('本街还有没学过的菜：3 天内学到过新菜就不搬，超过 3 天没学到就搬', async () => {
    const config = testConfig();
    const ids = config.cookbookIndex.idsByStreet.get(0)!;
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: { level: 30, star_level: 1, coin: 5_000_000, oil: 9000, oil_max: 9000, table_num: 4 },
      cookbooks: Object.fromEntries(ids.slice(1).map((id) => [id, 1])),
      goods: { [GOODS.moveCard]: 1 },
      tables,
    });
    const now = t.clock.now.getTime();
    const bot = {
      name: 'b',
      persona: PERSONAS[0]!,
      ctx,
      lastLearned: ids.length - 1,
      lastFreshAt: new Date(now - 2 * 86_400_000),
    };
    await botTurn(t.game, bot);
    expect((await t.game.restaurant.overview(ctx.restaurantId)).streetId).toBe(0);
    bot.lastFreshAt = new Date(now - 4 * 86_400_000);
    await botTurn(t.game, bot);
    expect((await t.game.restaurant.overview(ctx.restaurantId)).streetId).not.toBe(0);
  }, 60_000);

  it('有体力时灭掉自己店里的蟑螂', async () => {
    const tables = [
      { no: 1, floor: 1, customer: 3, roach: { by: null, at: '2026-09-30T00:00:00Z' } },
      { no: 2, floor: 1, customer: 0 },
    ];
    const ctx = await newRestaurant(t, { patch: { coin: 1000 }, tables });
    await botTurn(t.game, { name: 'b', persona: PERSONAS[0]!, ctx });
    const r = await t.game.restaurant.overview(ctx.restaurantId);
    expect(r.tables.find((x) => x.no === 1)!.customer).not.toBe(3);
  }, 60_000);
});
