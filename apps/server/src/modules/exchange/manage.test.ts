import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { addDays, gameDay } from '@dt/shared';
import { exchangeJobs, expireOrders } from './jobs';
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
    // 这里只看玩家挂单的合并；系统做市的一档见 maker-query.test.ts（156-3）
    const players = (levels: typeof book.bids) => levels.filter((l) => !l.system);
    expect(players(book.asks)).toEqual([
      { price: p + 1, qty: 4, system: false },
      { price: p + 2, qty: 1, system: false },
    ]);
    expect(players(book.bids)).toEqual([{ price: p, qty: 4, system: false }]);
    const me = await svc().me(b);
    expect(me.eligible).toBe(true);
    expect(me.orders.map((o) => o.price)).toEqual([p]);
    expect(me.trades).toEqual([expect.objectContaining({ side: 'buy', price: p + 1, qty: 1, fee: 0 })]);
    const foods = await svc().foods(b);
    // 列表标出正在卖、正在收的数量（问题记录 282）：卖单剩 1 + 1 + 3，买单剩 4；过期的单不算
    expect(foods.find((x) => x.foodsId === f.id)).toMatchObject({
      ref: p,
      last: p + 1,
      selling: 5,
      buying: 4,
      sysStock: 0,
    });
    await t.db
      .updateTable('exchange_order')
      .set({ expires_at: new Date(t.clock.now.getTime() - 1000) })
      .where('rest_id', '=', s2.restaurantId)
      .execute();
    expect((await svc().foods(b)).find((x) => x.foodsId === f.id)).toMatchObject({ selling: 2, buying: 4 });
    expect(foods.every((x) => t.deps.config.requireFood(x.foodsId).odds < 100)).toBe(true);
  });
});

describe('终审 I1：放不下的食材留在账户里，不写"丢掉了"', () => {
  const logs = (restId: number, type: string) =>
    t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', restId)
      .where('type', '=', type)
      .execute();
  it('取出时橱柜和冰箱都满：一个都不取，不写丢弃日志，也不写取出日志', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, coin: 0 });
    await t.db
      .updateTable('restaurant')
      .set({ foods_max_num: 10 })
      .where('id', '=', r.restaurantId)
      .execute();
    await t.db
      .insertInto('cupboard_food')
      .values({ rest_id: r.restaurantId, foods_id: f.id, num: 10, fridge_num: 10 })
      .onConflict((oc) => oc.columns(['rest_id', 'foods_id']).doUpdateSet({ num: 10, fridge_num: 10 }))
      .execute();
    await t.db
      .insertInto('exchange_wallet_food')
      .values({ rest_id: r.restaurantId, foods_id: f.id, num: 5 })
      .execute();
    const w = await svc().withdraw(r);
    expect(w.data).toEqual({ coin: 0, foods: [], left: [{ foodsId: f.id, num: 5 }] });
    expect(await logs(r.restaurantId, 'fridge.drop')).toEqual([]);
    expect(await logs(r.restaurantId, 'exchange.withdraw')).toEqual([]);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 5 } });
  });
  it('撤卖单时退回的食材放不下：进交易所账户，不写丢弃日志', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId, foods: { [f.id]: 3 } });
    const o = await svc().place(r, { foodsId: f.id, side: 'sell', price: f.coin * 2, qty: 3 });
    // 挂单后橱柜和冰箱被占满（比如又从菜场买了）
    await t.db
      .updateTable('restaurant')
      .set({ foods_max_num: 10 })
      .where('id', '=', r.restaurantId)
      .execute();
    await t.db
      .insertInto('cupboard_food')
      .values({ rest_id: r.restaurantId, foods_id: f.id, num: 10, fridge_num: 10 })
      .onConflict((oc) => oc.columns(['rest_id', 'foods_id']).doUpdateSet({ num: 10, fridge_num: 10 }))
      .execute();
    await svc().cancel(r, o.data.order.id);
    expect(await wallet(t, r.restaurantId)).toEqual({ coin: 0, foods: { [f.id]: 3 } });
    expect(await logs(r.restaurantId, 'fridge.drop')).toEqual([]);
  });
});

describe('系统收购的每日计数只留 30 天（backlog 156-3）', () => {
  it('清掉本区服 30 天前的 exchange_maker_day，别的区服和近 30 天的留着；每个游戏日跑一次', async () => {
    const shardId = await createShard(t.db);
    const other = await createShard(t.db);
    const today = gameDay(t.clock.now);
    const rows = [
      { shard_id: shardId, foods_id: 1, day: addDays(today, -31), bought: 1 },
      { shard_id: shardId, foods_id: 1, day: addDays(today, -30), bought: 2 },
      { shard_id: shardId, foods_id: 2, day: today, bought: 3 },
      { shard_id: other, foods_id: 1, day: addDays(today, -40), bought: 4 },
    ];
    await t.db.insertInto('exchange_maker_day').values(rows).execute();
    const job = exchangeJobs(t.game.deps).find((j) => j.name === 'exchange-maker-day-prune')!;
    expect(job.period(t.clock.now, await t.game.deps.shards.settings(shardId))).toBe(today);
    expect(await job.run({ shardId, now: t.clock.now } as never)).toEqual({ deleted: 1 });
    const left = await t.db
      .selectFrom('exchange_maker_day')
      .select('bought')
      .where('shard_id', 'in', [shardId, other])
      .orderBy('bought')
      .execute();
    expect(left.map((r) => r.bought)).toEqual([2, 3, 4]);
  });
});
