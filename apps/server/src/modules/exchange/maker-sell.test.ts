import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { setTuning } from '../../../test/town';
import { getDaily } from '../counter/dailyCounter';
import { makerState, marketFloor, TO_SYSTEM } from './maker';
import { refPrice } from './ref';
import { feeOf, isTradable, priceBand } from './rules';
import { trader } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const tune = () => t.deps.config.tuning.exchange;
const day = () => gameDay(t.clock.now);
const have = async (restId: number, foodsId: number) => {
  const x = await foodNum(t, restId, foodsId);
  return x.num + x.fridge;
};
/** 3 级、会上特价货架的可交易食材：系统收购价被菜场价封顶到挂单下限以下 */
const lv3 = () =>
  [...t.deps.config.foods.values()].find(
    (f) =>
      f.level === 3 && isTradable(f) && marketFloor(f, t.deps.config, t.deps.config.tuning.market) !== null,
  )!;

async function setup(maker?: Record<string, unknown>) {
  const shardId = await createShard(t.db);
  if (maker) await setTuning(t, shardId, { exchange: { maker } });
  const f = lv3();
  const seller = await trader(t, { shardId, coin: 0, foods: { [f.id]: 30 } });
  const bk = await svc().book(seller, f.id);
  const sys = bk.bids.find((b) => b.system);
  return { shardId, f, seller, sys };
}

describe('卖给系统（问题记录 244）', () => {
  it('3 级是兜底价，低于挂单下限；卖给系统：扣食材、按系统价减手续费加银币、库存和额度增加、订单直接成交', async () => {
    const { shardId, f, seller, sys } = await setup();
    const ref = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, day());
    expect(sys).toMatchObject({ floor: true });
    expect(sys!.price).toBeLessThan(priceBand(ref, tune()).min);
    const r = await svc().sellToSystem(seller, { foodsId: f.id, qty: 5, price: sys!.price });
    const fee = r.data.fills[0]!;
    expect(r.data.order).toMatchObject({
      side: 'sell',
      price: sys!.price,
      qty: 5,
      filled: 5,
      status: 'filled',
    });
    expect(fee).toMatchObject({ price: sys!.price, qty: 5, held: false });
    expect(await have(seller.restaurantId, f.id)).toBe(25);
    const coin = Number((await restRow(t, seller.restaurantId)).coin);
    expect(coin).toBe(sys!.price * 5 - feeOf(sys!.price, 5, tune()));
    expect(await makerState(t.db, shardId, f.id, day())).toMatchObject({ stock: 5, bought: 5 });
    expect(await getDaily(t.db, seller.restaurantId, TO_SYSTEM, day())).toBe(5);
    const trades = await t.db
      .selectFrom('exchange_trade')
      .selectAll()
      .where('shard_id', '=', shardId)
      .execute();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      system: true,
      seller_rest_id: seller.restaurantId,
      buyer_rest_id: null,
    });
  });

  it('价格变了（系统收购价低于看到的价）拒绝；超过系统能收的数量整单拒绝；食材都不扣', async () => {
    const { f, seller, sys } = await setup();
    await expect(
      svc().sellToSystem(seller, { foodsId: f.id, qty: 1, price: sys!.price + 1 }),
    ).rejects.toMatchObject({
      params: { reason: 'exchange_price_moved' },
    });
    await expect(
      svc().sellToSystem(seller, { foodsId: f.id, qty: tune().maker.playerDaily + 1, price: sys!.price }),
    ).rejects.toMatchObject({ params: { what: 'exchange_system_qty', max: tune().maker.playerDaily } });
    expect(await have(seller.restaurantId, f.id)).toBe(30);
  });

  it('系统做市关了没有买档；等级不够、交易所被冻结都拒绝', async () => {
    const off = await setup({ enabled: false });
    expect(off.sys).toBeUndefined();
    await expect(
      svc().sellToSystem(off.seller, { foodsId: off.f.id, qty: 1, price: 1 }),
    ).rejects.toMatchObject({
      params: { reason: 'exchange_no_system_bid' },
    });
    const { f, seller, sys } = await setup();
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', seller.restaurantId).execute();
    await expect(
      svc().sellToSystem(seller, { foodsId: f.id, qty: 1, price: sys!.price }),
    ).rejects.toMatchObject({
      params: { reason: 'exchange_level' },
    });
    await t.db.updateTable('restaurant').set({ level: 30 }).where('id', '=', seller.restaurantId).execute();
    await t.db
      .insertInto('exchange_freeze')
      .values({ rest_id: seller.restaurantId, reason: '测试', actor_account_id: null })
      .execute();
    await expect(
      svc().sellToSystem(seller, { foodsId: f.id, qty: 1, price: sys!.price }),
    ).rejects.toMatchObject({
      params: { reason: 'exchange_frozen' },
    });
    expect(await have(seller.restaurantId, f.id)).toBe(30);
  });

  it('普通卖单仍然不能低于挂单下限，按下限挂的卖单也不会和兜底档成交', async () => {
    const { shardId, f, seller, sys } = await setup();
    const ref = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, day());
    const band = priceBand(ref, tune());
    await expect(
      svc().place(seller, { foodsId: f.id, side: 'sell', price: sys!.price, qty: 1 }),
    ).rejects.toMatchObject({ params: { reason: 'price_band' } });
    const r = await svc().place(seller, { foodsId: f.id, side: 'sell', price: band.min, qty: 2 });
    expect(r.data.order).toMatchObject({ filled: 0, status: 'open' });
    expect(await makerState(t.db, shardId, f.id, day())).toMatchObject({ stock: 0, bought: 0 });
  });
});

describe('backlog 156-3：规格书 §8 系统成交不算反复对倒', () => {
  it('同一家店反复卖给系统，超过反复对倒的次数也不标记、所得不冻结', async () => {
    const { shardId, f, seller, sys } = await setup();
    const times = tune().suspicious.repeatCount + 2;
    for (let i = 0; i < times; i++) {
      const r = await svc().sellToSystem(seller, { foodsId: f.id, qty: 1, price: sys!.price });
      expect(r.data.fills.every((x) => !x.held)).toBe(true);
    }
    const trades = await t.db
      .selectFrom('exchange_trade')
      .select('flags')
      .where('shard_id', '=', shardId)
      .execute();
    expect(trades).toHaveLength(times);
    expect(trades.every((x) => x.flags.length === 0)).toBe(true);
  });
});

describe('任务计数（问题记录 318）', () => {
  it('卖给系统也计 exchange.fill', async () => {
    const { f, seller, sys } = await setup();
    await svc().sellToSystem(seller, { foodsId: f.id, qty: 1, price: sys!.price });
    expect(await eventCount(t, seller.restaurantId, 'exchange.fill')).toBe(1);
  });
});
