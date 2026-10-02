import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { trader, wallet } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100 && f.coin >= 1000)!;
const have = async (restId: number, foodsId: number) => {
  const x = await foodNum(t, restId, foodsId);
  return x.num + x.fridge;
};
async function trace(accountId: number, ip: string, deviceId: string | null) {
  await t.db.insertInto('login_trace').values({ account_id: accountId, ip, device_id: deviceId }).execute();
}
const holds = (restId: number) =>
  t.db
    .selectFrom('exchange_hold')
    .select(['coin', 'foods_id', 'num', 'status'])
    .where('rest_id', '=', restId)
    .execute();
const lastTrade = (shardId: number) =>
  t.db
    .selectFrom('exchange_trade')
    .select(['flags', 'buyer_account_id', 'seller_account_id'])
    .where('shard_id', '=', shardId)
    .orderBy('id', 'desc')
    .executeTakeFirstOrThrow();

describe('撮合里的防作弊（156-2 设计 §4、§5）', () => {
  it('同设备的挂单跳过（挂单还在）；同 IP 照常成交、标记 same_ip、双方所得进冻结', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 2 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await trace(s.accountId, '10.1.1.1', 'dev-same-0001');
    await trace(b.accountId, '10.2.2.2', 'dev-same-0001');
    const r1 = await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    expect(r1.data.fills).toEqual([]);

    const b2 = await trader(t, { shardId, coin: 1_000_000 });
    await trace(b2.accountId, '10.1.1.1', 'dev-other-0002');
    const r2 = await svc().place(b2, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    expect(r2.data.fills).toEqual([{ price: f.coin, qty: 1, held: true }]);
    expect((await lastTrade(shardId)).flags).toEqual(['same_ip']);
    // 吃单方（买方）的食材不当场到账，进冻结；卖方银币进冻结，不进可用余额
    expect(await have(b2.restaurantId, f.id)).toBe(0);
    expect(await holds(b2.restaurantId)).toEqual([{ coin: 0, foods_id: f.id, num: 1, status: 'held' }]);
    const fee = Math.floor(f.coin * 0.05);
    expect(await holds(s.restaurantId)).toEqual([
      { coin: f.coin - fee, foods_id: null, num: 0, status: 'held' },
    ]);
    expect(await wallet(t, s.restaurantId)).toEqual({ coin: 0, foods: {} });
  });

  it('吃单方是买单、可疑成交：差价照常退，所得进冻结', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await trace(s.accountId, '10.3.3.3', null);
    await trace(b.accountId, '10.3.3.3', null);
    await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin + 100, qty: 1 });
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000 - f.coin);
    expect(await holds(b.restaurantId)).toEqual([{ coin: 0, foods_id: f.id, num: 1, status: 'held' }]);
  });

  it('吃单方是卖单、可疑成交：银币不当场到账；挂单方买家的食材进冻结', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const b = await trader(t, { shardId, coin: 1_000_000 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: Math.floor(f.coin * 1.9), qty: 1 });
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    const r = await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    expect(r.data.fills[0]!.held).toBe(true);
    expect((await lastTrade(shardId)).flags).toEqual(['edge_price']);
    expect((await restRow(t, s.restaurantId)).coin).toBe(0);
    expect((await holds(s.restaurantId))[0]!.status).toBe('held');
    expect(await holds(b.restaurantId)).toEqual([{ coin: 0, foods_id: f.id, num: 1, status: 'held' }]);
    expect(await wallet(t, b.restaurantId)).toEqual({ coin: 0, foods: {} });
  });

  it('反复对倒按账号累计（同一次下单里的几笔也算），不分方向；记下双方账号', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const a = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 10 } });
    const b = await trader(t, { shardId, coin: 1_000_000, foods: { [f.id]: 10 } });
    await svc().place(a, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 }); // 第 1 笔：b 买 a
    await svc().place(a, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    await svc().place(a, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    const r = await svc().place(b, { foodsId: f.id, side: 'sell', price: f.coin, qty: 2 }); // 第 2、3 笔：a 买 b
    expect(r.data.fills.map((x) => x.held)).toEqual([false, true]);
    const tr = await lastTrade(shardId);
    expect(tr.flags).toEqual(['repeat_pair']);
    expect([tr.buyer_account_id, tr.seller_account_id]).toEqual([a.accountId, b.accountId]);
  });

  it('没有标记的成交照常到账', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: f.coin, qty: 1 });
    const b = await trader(t, { shardId, coin: 1_000_000 });
    const r = await svc().place(b, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 });
    expect(r.data.fills).toEqual([{ price: f.coin, qty: 1, held: false }]);
    expect(await have(b.restaurantId, f.id)).toBe(1);
    expect(await holds(b.restaurantId)).toEqual([]);
  });

  it('被冻结的店不能下单', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const r = await trader(t, { shardId });
    await t.db.insertInto('exchange_freeze').values({ rest_id: r.restaurantId, reason: '对倒' }).execute();
    await expect(svc().place(r, { foodsId: f.id, side: 'buy', price: f.coin, qty: 1 })).rejects.toMatchObject(
      {
        params: { reason: 'exchange_frozen' },
      },
    );
  });
});
