import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { expireOrders } from './jobs';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
/** 橱柜 + 冰箱里这种食材的总数 */
const have = async (restId: number, foodsId: number) => {
  const x = await foodNum(t, restId, foodsId);
  return x.num + x.fridge;
};
const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100 && f.coin >= 1000)!;
const H = 3_600_000;

describe('撤单、过期、取出（156-1 设计 §6.3~§6.5）', () => {
  it('撤单：卖单剩余食材回橱柜，买单剩余银币回店；不是自己的单报 NOT_FOUND；撤过的报 order_closed', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 5 } });
    const sell = await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 3 });
    const buy = await svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 2 });
    await svc().cancel(r, sell.data.order.id);
    await svc().cancel(r, buy.data.order.id);
    expect(await have(r.restaurantId, f.id)).toBe(5);
    expect((await restRow(t, r.restaurantId)).coin).toBe(1_000_000);
    await expect(svc().cancel(r, sell.data.order.id)).rejects.toMatchObject({
      params: { reason: 'order_closed' },
    });
    const other = await trader(t, { shardId });
    await expect(svc().cancel(other, buy.data.order.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('过期：剩余部分退回交易所账户；交易所关闭时撤单、取出、过期照常', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 5 } });
    await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 2 });
    const keep = await svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { exchange: false } }) })
      .onConflict((oc) =>
        oc.column('shard_id').doUpdateSet({ override: JSON.stringify({ features: { exchange: false } }) }),
      )
      .execute();
    t.game.deps.shards.invalidate(shardId);
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject(
      {
        code: 'FEATURE_DISABLED',
      },
    );
    await svc().cancel(r, keep.data.order.id);
    const res = await expireOrders(t.game.deps, shardId, new Date(t.clock.now.getTime() + 25 * H));
    expect(res.expired).toBe(1);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 2 } });
    const w = await svc().withdraw(r);
    expect(w.data.foods).toEqual([{ foodsId: f.id, num: 2 }]);
    expect(await have(r.restaurantId, f.id)).toBe(5);
  });

  it('取出：银币全部取出；橱柜放不下的食材留在账户里', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 0 });
    await t.db
      .updateTable('restaurant')
      .set({ foods_max_num: 10, cupboard_num: 1 })
      .where('id', '=', r.restaurantId)
      .execute();
    await t.db.insertInto('exchange_wallet').values({ rest_id: r.restaurantId, coin: 500 }).execute();
    await t.db
      .insertInto('exchange_wallet_food')
      .values({ rest_id: r.restaurantId, foods_id: f.id, num: 25 })
      .execute();
    const w = await svc().withdraw(r);
    expect((await restRow(t, r.restaurantId)).coin).toBe(500);
    const got = w.data.foods.find((x) => x.foodsId === f.id)?.num ?? 0;
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThan(25);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 25 - got } });
  });
});

describe('查询（156-1 设计 §7）', () => {
  it('盘口按价格合并、各 5 档；参考价和允许范围；我的挂单、账户、成交、开通状态', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const p = f.coin;
    const s = await trader(t, { shardId, foods: { [f.id]: 20 } });
    const s2 = await trader(t, { shardId, foods: { [f.id]: 20 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: p + 1, qty: 2 });
    await svc().place(s2, { foodsId: f.id, side: 'sell', price: p + 1, qty: 3 });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: p + 2, qty: 1 });
    const b = await trader(t, { shardId });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: p, qty: 4 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: p + 1, qty: 1 });
    const book = await svc().book(b, f.id);
    expect(book).toMatchObject({ ref: p, min: Math.ceil(p * 0.5), max: p * 2, last: p + 1, volume: 1 });
    expect(book.asks).toEqual([
      { price: p + 1, qty: 4 },
      { price: p + 2, qty: 1 },
    ]);
    expect(book.bids).toEqual([{ price: p, qty: 4 }]);
    const me = await svc().me(b);
    expect(me.eligible).toBe(true);
    expect(me.orders.map((o) => o.price)).toEqual([p]);
    expect(me.trades).toEqual([expect.objectContaining({ side: 'buy', price: p + 1, qty: 1, fee: 0 })]);
    const foods = await svc().foods(b);
    expect(foods.find((x) => x.foodsId === f.id)).toMatchObject({ ref: p, last: p + 1 });
    expect(foods.every((x) => t.deps.config.requireFood(x.foodsId).odds < 100)).toBe(true);
  });
});
