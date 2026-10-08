import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';

/** 支线“经营”的状态条件（任务清单第二版）：任务页按现在的数算 */
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

type Ctx = Awaited<ReturnType<typeof newRestaurant>>;
async function progress(ctx: Ctx, key: string, target: number) {
  const q = t.deps.config.bundle.quests.find((x) => x.cond.key === key && x.cond.target === target)!;
  await showQuest(t, ctx.restaurantId, q.id);
  return questIn(await t.game.task.tasks(ctx), q.id)?.progress;
}

describe('支线“经营”', () => {
  it('餐桌数按已摆的桌子算', async () => {
    const ctx = await newRestaurant(t);
    const tables = Array.from({ length: 7 }, (_, i) => ({ no: i + 1, floor: 1, customer: 0 }));
    await t.db
      .updateTable('restaurant_tables')
      .set({ tables: JSON.stringify(tables) })
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(await progress(ctx, 'rest.tables', 16)).toBe(7);
  });

  it('设施按生效中的算，过期的不算', async () => {
    const ctx = await newRestaurant(t);
    const goods = [...t.deps.config.goods.values()].filter((g) => g.deviceType === 1).map((g) => g.id);
    // 按游戏时钟算（它在文件开头就定住了）：原来按 Date.now()，机器忙时文件开头到这里超过 1 秒，“1 秒前过期”的在游戏时钟看来还没过期
    const now = t.clock.now;
    const later = new Date(now.getTime() + 3_600_000);
    await t.db
      .insertInto('restaurant_device')
      .values([
        { rest_id: ctx.restaurantId, slot: 1, goods_id: goods[0]!, placed_at: new Date(), expires_at: null },
        { rest_id: ctx.restaurantId, slot: 2, goods_id: goods[0]!, placed_at: new Date(), expires_at: later },
        {
          rest_id: ctx.restaurantId,
          slot: 3,
          goods_id: goods[0]!,
          placed_at: new Date(),
          expires_at: new Date(now.getTime() - 1000),
        },
      ])
      .execute();
    expect(await progress(ctx, 'rest.devices', 6)).toBe(2);
  });

  it('单日结算银币、营业轮数按历史最高；没有记录为 0', async () => {
    const ctx = await newRestaurant(t);
    expect(await progress(ctx, 'rest.bestDayCoin', 100_000)).toBe(0);
    await t.db
      .insertInto('rest_income_best')
      .values({ rest_id: ctx.restaurantId, day_coin: 123_456, day_rounds: 200 })
      .execute();
    expect(await progress(ctx, 'rest.bestDayCoin', 300_000)).toBe(123_456);
    expect(await progress(ctx, 'rest.bestRounds', 350)).toBe(200);
  });
});
