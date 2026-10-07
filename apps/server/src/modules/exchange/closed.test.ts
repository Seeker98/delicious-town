import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { expireOrders } from './jobs';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const svc = () => t.game.exchange;
/** 六级的稀有食材（牡丹籽油这类）：原来能上交易所 */
const six = () => [...t.deps.config.foods.values()].find((f) => f.level === 6 && f.odds < 100)!;

describe('六级食材不能在交易所交易（问题记录 461，区服数值 exchange.closedLevels）', () => {
  it('默认关掉六级：不能下单、不在食材列表里、看盘被拒', async () => {
    expect(t.deps.config.tuning.exchange.closedLevels).toEqual([6]);
    const shardId = await createShard(t.db);
    const f = six();
    const r = await trader(t, { shardId, coin: 10_000_000 });
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject(
      {
        params: { reason: 'not_tradable' },
      },
    );
    expect((await svc().foods(r)).some((x) => t.deps.config.foods.get(x.foodsId)?.level === 6)).toBe(false);
    expect((await svc().foods(r)).some((x) => t.deps.config.foods.get(x.foodsId)?.level === 5)).toBe(true);
    await expect(svc().book(r, f.id)).rejects.toMatchObject({ params: { reason: 'not_tradable' } });
  });

  it('上线前挂着的六级单：下一次过期任务就下架，东西和银币退回交易所账户', async () => {
    const shardId = await createShard(t.db);
    const f = six();
    const seller = await trader(t, { shardId });
    const buyer = await trader(t, { shardId });
    const later = new Date(t.clock.now.getTime() + 20 * 3_600_000);
    const order = (restId: number, side: 'buy' | 'sell') =>
      t.db
        .insertInto('exchange_order')
        .values({
          shard_id: shardId,
          rest_id: restId,
          side,
          foods_id: f.id,
          price: 5000,
          qty: 3,
          status: 'open',
          expires_at: later,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const sell = await order(seller.restaurantId, 'sell');
    const buy = await order(buyer.restaurantId, 'buy');
    expect(await expireOrders(t.game.deps, shardId, t.clock.now)).toEqual({ expired: 2 });
    const rows = await t.db
      .selectFrom('exchange_order')
      .select(['id', 'status'])
      .where('id', 'in', [sell.id, buy.id])
      .execute();
    expect(rows.map((x) => x.status)).toEqual(['expired', 'expired']);
    expect((await wallet(t, seller.restaurantId)).foods).toEqual({ [f.id]: 3 });
    expect((await wallet(t, buyer.restaurantId)).coin).toBe(15_000);
  });
});
