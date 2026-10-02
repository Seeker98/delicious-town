import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { getDaily } from '../counter/dailyCounter';
import { makerPrices, makerState, TO_SYSTEM } from './maker';
import { refPrice } from './ref';
import { priceBand } from './rules';
import { trader } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const tune = () => t.deps.config.tuning.exchange;
/** 6 级稀有食材：菜场不卖，系统买价 = floor(参考价 × 0.7) */
const lv6 = () => [...t.deps.config.foods.values()].find((f) => f.level === 6 && f.odds < 100 && f.odds > 0)!;
const day = () => gameDay(t.clock.now);
const have = async (restId: number, foodsId: number) => {
  const x = await foodNum(t, restId, foodsId);
  return x.num + x.fridge;
};

async function setup(o: { maker?: Record<string, unknown>; suspicious?: Record<string, unknown> } = {}) {
  const shardId = await createShard(t.db);
  if (o.maker || o.suspicious)
    await setTuning(t, shardId, {
      exchange: {
        ...(o.maker ? { maker: o.maker } : {}),
        ...(o.suspicious ? { suspicious: o.suspicious } : {}),
      },
    });
  const f = lv6();
  const ref = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, day());
  const band = priceBand(ref, tune());
  // 期望值用同一个纯函数算（Task 1 已单独测过），避免浮点取整和实现不一致
  const p = makerPrices(ref, null, band, tune().maker);
  return { shardId, f, ref, band, bid: p.bid!, ask: p.ask };
}
const trades = (shardId: number) =>
  t.db.selectFrom('exchange_trade').selectAll().where('shard_id', '=', shardId).orderBy('id').execute();

describe('卖给系统（156-3 设计 §4.3）', () => {
  it('按系统买价成交，扣手续费；库存、今天已收、玩家今天已卖各自增加', async () => {
    const { shardId, f, band, bid } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    expect(res.data.fills).toEqual([{ price: bid, qty: 3, held: false }]);
    expect(res.data.order.status).toBe('filled');
    const fee = Math.floor(bid * 3 * 0.05);
    expect(Number((await restRow(t, s.restaurantId)).coin)).toBe(bid * 3 - fee);
    expect(await makerState(t.db, shardId, f.id, day())).toEqual({ stock: 3, bought: 3 });
    expect(await getDaily(t.db, s.restaurantId, TO_SYSTEM, day())).toBe(3);
    const [tr] = await trades(shardId);
    expect(tr).toMatchObject({
      system: true,
      price: bid,
      qty: 3,
      buyer_rest_id: null,
      buyer_account_id: null,
      buy_order_id: null,
      seller_rest_id: s.restaurantId,
      flags: [],
    });
    expect(Number(tr!.fee)).toBe(fee);
  });

  it('系统成交不标记、不冻结（大额门槛调到 1 也一样）', async () => {
    const { shardId, f, band } = await setup({ suspicious: { largeAmount: 1 } });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 2 });
    expect(res.data.fills[0]!.held).toBe(false);
    expect((await trades(shardId))[0]!.flags).toEqual([]);
    const holds = await t.db
      .selectFrom('exchange_hold')
      .select('id')
      .where('rest_id', '=', s.restaurantId)
      .execute();
    expect(holds).toHaveLength(0);
  });

  it('玩家每天卖给系统的上限；一次下单超过时系统吃满额度，剩下的挂着（Review Focus 1）', async () => {
    const { shardId, f, band } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 30 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 25 });
    expect(res.data.order).toMatchObject({ filled: 20, status: 'open' });
    const again = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 1 });
    expect(again.data.fills).toEqual([]);
    expect(await makerState(t.db, shardId, f.id, day())).toEqual({ stock: 20, bought: 20 });
  });

  it('每日收购上限是全区服的；库存上限也生效', async () => {
    const a = await setup({ maker: { dailyBuy: 3 } });
    const s1 = await trader(t, { shardId: a.shardId, coin: 0, foods: { [a.f.id]: 5 } });
    const s2 = await trader(t, { shardId: a.shardId, coin: 0, foods: { [a.f.id]: 5 } });
    await svc().place(s1, { foodsId: a.f.id, side: 'sell', price: a.band.min, qty: 2 });
    const r2 = await svc().place(s2, { foodsId: a.f.id, side: 'sell', price: a.band.min, qty: 2 });
    expect(r2.data.order.filled).toBe(1);
    const b = await setup({ maker: { stockMax: 4 } });
    const s3 = await trader(t, { shardId: b.shardId, coin: 0, foods: { [b.f.id]: 6 } });
    const r3 = await svc().place(s3, { foodsId: b.f.id, side: 'sell', price: b.band.min, qty: 6 });
    expect(r3.data.order.filled).toBe(4);
  });

  it('卖价高于系统买价不成交；关掉做市不成交', async () => {
    const { shardId, f, bid } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const r = await svc().place(s, { foodsId: f.id, side: 'sell', price: bid + 1, qty: 1 });
    expect(r.data.fills).toEqual([]);
    const off = await setup({ maker: { enabled: false } });
    const s2 = await trader(t, { shardId: off.shardId, coin: 0, foods: { [off.f.id]: 5 } });
    const r2 = await svc().place(s2, { foodsId: off.f.id, side: 'sell', price: off.band.min, qty: 1 });
    expect(r2.data.fills).toEqual([]);
  });

  it('被冻结的店不能卖给系统（Review Focus 2）', async () => {
    const { shardId, f, band } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await t.db.insertInto('exchange_freeze').values({ rest_id: s.restaurantId, reason: '测试' }).execute();
    await expect(
      svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 1 }),
    ).rejects.toMatchObject({ params: { reason: 'exchange_frozen' } });
    expect(await makerState(t.db, shardId, f.id, day())).toEqual({ stock: 0, bought: 0 });
  });

  it('并发：两个玩家同时卖给系统，合计不超过今天的收购上限', async () => {
    const { shardId, f, band } = await setup({ maker: { dailyBuy: 5 } });
    const s1 = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const s2 = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const [r1, r2] = await Promise.all([
      svc().place(s1, { foodsId: f.id, side: 'sell', price: band.min, qty: 4 }),
      svc().place(s2, { foodsId: f.id, side: 'sell', price: band.min, qty: 4 }),
    ]);
    expect(r1.data.order.filled + r2.data.order.filled).toBe(5);
    expect(await makerState(t.db, shardId, f.id, day())).toEqual({ stock: 5, bought: 5 });
  });
});

describe('从系统买（156-3 设计 §4.3）', () => {
  it('按系统卖价成交，多冻结的银币退回；只卖库存，卖完就没有这一档', async () => {
    const { shardId, f, band, ask } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    const b = await trader(t, { shardId, coin: 50_000_000 });
    const res = await svc().place(b, { foodsId: f.id, side: 'buy', price: band.max, qty: 5 });
    expect(res.data.fills).toEqual([{ price: ask, qty: 3, held: false }]);
    expect(res.data.order).toMatchObject({ filled: 3, status: 'open' });
    expect(Number((await restRow(t, b.restaurantId)).coin)).toBe(50_000_000 - ask * 3 - band.max * 2);
    expect(await have(b.restaurantId, f.id)).toBe(3);
    expect(await makerState(t.db, shardId, f.id, day())).toMatchObject({ stock: 0 });
    const last = (await trades(shardId)).at(-1)!;
    expect(last).toMatchObject({
      system: true,
      seller_rest_id: null,
      sell_order_id: null,
      buyer_rest_id: b.restaurantId,
    });
    expect(Number(last.fee)).toBe(0);
  });

  it('守恒：玩家食材 + 系统库存不变；玩家银币变化合计 = −(卖出收回 − 收购花出) − 手续费', async () => {
    const { shardId, f, band, bid, ask } = await setup();
    const s = await trader(t, { shardId, coin: 1_000, foods: { [f.id]: 10 } });
    const b = await trader(t, { shardId, coin: 50_000_000 });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 10 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: band.max, qty: 4 });
    const st = await makerState(t.db, shardId, f.id, day());
    expect((await have(s.restaurantId, f.id)) + (await have(b.restaurantId, f.id)) + st.stock).toBe(10);
    const coins =
      Number((await restRow(t, s.restaurantId)).coin) + Number((await restRow(t, b.restaurantId)).coin);
    const fee = Math.floor(bid * 10 * 0.05);
    expect(coins - (1_000 + 50_000_000)).toBe(-(ask * 4 - bid * 10) - fee);
  });
});

describe('系统和玩家挂单的先后（156-3 设计 §4.3）', () => {
  it('卖单：同价时玩家买单先成交，系统排后', async () => {
    const { shardId, f, band, bid } = await setup();
    const p = await trader(t, { shardId, coin: 50_000_000 });
    await svc().place(p, { foodsId: f.id, side: 'buy', price: bid, qty: 2 });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    expect(res.data.fills).toEqual([
      { price: bid, qty: 2, held: false },
      { price: bid, qty: 1, held: false },
    ]);
    expect((await trades(shardId)).map((x) => x.system)).toEqual([false, true]);
  });

  it('卖单：系统买价更高时系统先成交，玩家低价买单不动', async () => {
    const { shardId, f, band, bid } = await setup();
    const p = await trader(t, { shardId, coin: 50_000_000 });
    const po = await svc().place(p, { foodsId: f.id, side: 'buy', price: bid - 1, qty: 2 });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const res = await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    expect(res.data.fills).toEqual([{ price: bid, qty: 3, held: false }]);
    const mine = await svc().me(p);
    expect(mine.orders.find((o) => o.id === po.data.order.id)!.filled).toBe(0);
  });

  it('买单：同价时玩家卖单先成交；系统卖价更低时系统先成交', async () => {
    const { shardId, f, band, ask } = await setup();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 5 }); // 系统库存 5
    const p = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(p, { foodsId: f.id, side: 'sell', price: ask, qty: 2 });
    const b = await trader(t, { shardId, coin: 50_000_000 });
    const r1 = await svc().place(b, { foodsId: f.id, side: 'buy', price: ask, qty: 3 });
    expect(r1.data.fills).toEqual([
      { price: ask, qty: 2, held: false },
      { price: ask, qty: 1, held: false },
    ]);
    await svc().place(p, { foodsId: f.id, side: 'sell', price: ask + 1, qty: 2 });
    const r2 = await svc().place(b, { foodsId: f.id, side: 'buy', price: ask + 1, qty: 2 });
    expect(r2.data.fills).toEqual([{ price: ask, qty: 2, held: false }]);
  });
});
