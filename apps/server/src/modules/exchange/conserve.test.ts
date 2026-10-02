import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Food } from '@dt/config';
import { seededRng } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const rares = () => [...t.deps.config.foods.values()].filter((f) => f.odds < 100 && f.coin >= 1000);

/** 冷静期里还冻结着的（156-2）：银币、某种食材 */
async function held(restId: number, foodsId: number) {
  const rows = await t.db
    .selectFrom('exchange_hold')
    .select(['coin', 'foods_id', 'num'])
    .where('rest_id', '=', restId)
    .where('status', '=', 'held')
    .execute();
  return {
    coin: rows.reduce((s, r) => s + Number(r.coin), 0),
    foods: rows.filter((r) => r.foods_id === foodsId).reduce((s, r) => s + r.num, 0),
  };
}

/** 店里 + 交易所账户 + 挂着的单冻结的 + 冷静期冻结的：银币、某种食材的总数 */
async function totals(restIds: number[], foodsId: number) {
  let coin = 0;
  let foods = 0;
  for (const id of restIds) {
    const r = await t.db
      .selectFrom('restaurant')
      .select('coin')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const c = await t.db
      .selectFrom('cupboard_food')
      .select(['num', 'fridge_num'])
      .where('rest_id', '=', id)
      .where('foods_id', '=', foodsId)
      .executeTakeFirst();
    const w = await wallet(t, id);
    const h = await held(id, foodsId);
    coin += Number(r.coin) + w.coin + h.coin;
    foods += (c?.num ?? 0) + (c?.fridge_num ?? 0) + (w.foods[foodsId] ?? 0) + h.foods;
  }
  const open = await t.db
    .selectFrom('exchange_order')
    .select(['side', 'price', 'qty', 'filled'])
    .where('rest_id', 'in', restIds)
    .where('status', '=', 'open')
    .execute();
  for (const o of open) {
    if (o.side === 'buy') coin += o.price * (o.qty - o.filled);
    else foods += o.qty - o.filled;
  }
  const fee = await t.db
    .selectFrom('exchange_trade')
    .select((eb) => eb.fn.sum<string>('fee').as('fee'))
    .where('seller_rest_id', 'in', restIds)
    .executeTakeFirstOrThrow();
  return { coin: coin + Number(fee.fee ?? 0), foods };
}

describe('终审 I3：守恒（156-1 设计 §9）', () => {
  it('随机挂一批买卖单撮合后：银币（含冻结和手续费）、食材总数都不变', async () => {
    const shardId = await createShard(t.db);
    const f = rares()[0]!;
    const ts = [];
    for (let i = 0; i < 4; i++) ts.push(await trader(t, { shardId, coin: 5_000_000, foods: { [f.id]: 60 } }));
    const ids = ts.map((x) => x.restaurantId);
    const before = await totals(ids, f.id);
    const rng = seededRng(42);
    for (let i = 0; i < 40; i++) {
      const who = ts[Math.floor(rng.next() * ts.length)]!;
      const side = rng.next() < 0.5 ? 'buy' : 'sell';
      const price = f.coin + Math.floor(rng.next() * 41) - 20;
      const qty = 1 + Math.floor(rng.next() * 5);
      try {
        await svc().place(who, { foodsId: f.id, side, price, qty });
      } catch (e) {
        // 挂单数满了就撤掉最早的一张
        if ((e as { params?: { what?: string } }).params?.what !== 'exchange_orders') throw e;
        const me = await svc().me(who);
        await svc().cancel(who, me.orders.at(-1)!.id);
      }
    }
    const trades = await t.db
      .selectFrom('exchange_trade')
      .select('id')
      .where('shard_id', '=', shardId)
      .execute();
    expect(trades.length).toBeGreaterThan(5);
    expect(await totals(ids, f.id)).toEqual(before);
  });
});

describe('终审 I3：两个盘口同时给同两家挂单方入账（Review Focus 2）', () => {
  it('反复并发也不会死锁，账户金额正确', async () => {
    const shardId = await createShard(t.db);
    const [f1, f2] = rares().slice(0, 2) as [Food, Food];
    const m1 = await trader(t, { shardId, coin: 0, foods: { [f1.id]: 20, [f2.id]: 20 } });
    const m2 = await trader(t, { shardId, coin: 0, foods: { [f1.id]: 20, [f2.id]: 20 } });
    const b1 = await trader(t, { shardId, coin: 50_000_000 });
    const b2 = await trader(t, { shardId, coin: 50_000_000 });
    let expect1 = 0;
    let expect2 = 0;
    for (let round = 0; round < 5; round++) {
      // f1 上 m1 排前面，f2 上 m2 排前面：两笔成交给两家入账的先后相反
      await svc().place(m1, { foodsId: f1.id, side: 'sell', price: f1.coin, qty: 1 });
      await svc().place(m2, { foodsId: f1.id, side: 'sell', price: f1.coin, qty: 1 });
      await svc().place(m2, { foodsId: f2.id, side: 'sell', price: f2.coin, qty: 1 });
      await svc().place(m1, { foodsId: f2.id, side: 'sell', price: f2.coin, qty: 1 });
      await Promise.all([
        svc().place(b1, { foodsId: f1.id, side: 'buy', price: f1.coin, qty: 2 }),
        svc().place(b2, { foodsId: f2.id, side: 'buy', price: f2.coin, qty: 2 }),
      ]);
      const net = (p: number) => p - Math.floor(p * 0.05);
      expect1 += net(f1.coin) + net(f2.coin);
      expect2 += net(f1.coin) + net(f2.coin);
    }
    // 同一批账号反复成交会被标为反复对倒，所得进冷静期（156-2）：可用 + 冻结中合计
    expect((await wallet(t, m1.restaurantId)).coin + (await held(m1.restaurantId, 0)).coin).toBe(expect1);
    expect((await wallet(t, m2.restaurantId)).coin + (await held(m2.restaurantId, 0)).coin).toBe(expect2);
  });
});

describe('终审 I3：每张单的数量上限按区服数值', () => {
  it('区服把 maxQty 调成 5 时，挂 6 个报 exchange_qty', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ tuning: { exchange: { maxQty: 5 } } }) })
      .execute();
    t.game.deps.shards.invalidate(shardId);
    const f = rares()[0]!;
    const r = await trader(t, { shardId });
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 6 })).rejects.toMatchObject(
      {
        params: { what: 'exchange_qty', max: 5 },
      },
    );
  });
});
