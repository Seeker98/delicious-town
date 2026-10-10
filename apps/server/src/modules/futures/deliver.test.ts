import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, restRow, type TestGame } from '../../../test/game';
import { FUTURES_INITIAL } from '../../db/migrations/0063_futures';
import { trader } from '../exchange/test';
import { deliverDue, futuresJobs } from './deliver';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-10-10', 12)));

const HOUR = 3_600_000;
const FOOD = FUTURES_INITIAL.find((id) => config.foods.get(id)!.level === 3)!;
const OTHER = FUTURES_INITIAL.find((id) => config.foods.get(id)!.level === 2)!;

/** 直接插一张期货单：dueIn 小时后到期（负数 = 已经到期） */
async function put(
  shardId: number,
  restId: number,
  o: { foodsId?: number; qty?: number; deposit?: number; balance?: number; dueIn?: number },
) {
  const r = await t.db
    .insertInto('futures_contract')
    .values({
      shard_id: shardId,
      rest_id: restId,
      foods_id: o.foodsId ?? FOOD,
      qty: o.qty ?? 2,
      unit_price: 100,
      deposit: o.deposit ?? 60,
      balance: o.balance ?? 140,
      created_at: new Date(t.clock.now.getTime() - 72 * HOUR),
      due_at: new Date(t.clock.now.getTime() + (o.dueIn ?? -1) * HOUR),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const row = (id: string) =>
  t.db.selectFrom('futures_contract').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const logs = (restId: number, type: string) =>
  t.db
    .selectFrom('rest_log')
    .select('params')
    .where('rest_id', '=', restId)
    .where('type', '=', type)
    .execute()
    .then((r) => r.map((x) => x.params));

describe('期货到期交割（期货设计 §6）', () => {
  it('银币够：扣尾款，食材进橱柜，delivered、记 to_cupboard；写日志 futures.delivered', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1000 });
    const id = await put(shardId, r.restaurantId, { qty: 2, balance: 140 });
    expect(await deliverDue(t.game.deps, shardId, t.clock.now)).toMatchObject({ delivered: 1, defaulted: 0 });
    expect((await restRow(t, r.restaurantId)).coin).toBe(860);
    expect((await foodNum(t, r.restaurantId, FOOD)).num).toBe(2);
    expect(await row(id)).toMatchObject({ status: 'delivered', to_cupboard: 2, to_wallet: 0 });
    expect((await row(id)).settled_at).not.toBeNull();
    expect(await logs(r.restaurantId, 'futures.delivered')).toEqual([{ foodsId: FOOD, qty: 2, toWallet: 0 }]);
  });

  it('银币不够：defaulted，不扣不给；写 futures.defaulted（带没收的定金）', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 100 });
    const id = await put(shardId, r.restaurantId, { qty: 2, deposit: 60, balance: 140 });
    expect(await deliverDue(t.game.deps, shardId, t.clock.now)).toMatchObject({ delivered: 0, defaulted: 1 });
    expect((await restRow(t, r.restaurantId)).coin).toBe(100);
    expect((await foodNum(t, r.restaurantId, FOOD)).num).toBe(0);
    expect((await row(id)).status).toBe('defaulted');
    expect(await logs(r.restaurantId, 'futures.defaulted')).toEqual([{ foodsId: FOOD, qty: 2, deposit: 60 }]);
  });

  it('还没到期的不动；一家店几张按到期先后处理：前一张扣完尾款，后一张钱不够就违约', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 200 });
    const first = await put(shardId, r.restaurantId, { balance: 150, dueIn: -3 });
    const second = await put(shardId, r.restaurantId, { balance: 150, dueIn: -2 });
    const later = await put(shardId, r.restaurantId, { balance: 1, dueIn: 5 });
    await deliverDue(t.game.deps, shardId, t.clock.now);
    expect((await row(first)).status).toBe('delivered');
    expect((await row(second)).status).toBe('defaulted');
    expect((await row(later)).status).toBe('open');
    expect((await restRow(t, r.restaurantId)).coin).toBe(50);
  });

  it('橱柜和冰箱都放不下：多出的进交易所账户，记 to_wallet（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1000, foods: { [OTHER]: 3 } });
    await t.db
      .updateTable('restaurant')
      .set({ cupboard_num: 1, foods_max_num: 10 })
      .where('id', '=', r.restaurantId)
      .execute();
    const id = await put(shardId, r.restaurantId, { qty: 15, balance: 10 });
    await deliverDue(t.game.deps, shardId, t.clock.now);
    expect(await foodNum(t, r.restaurantId, FOOD)).toEqual({ num: 0, fridge: 10 });
    const wallet = await t.db
      .selectFrom('exchange_wallet_food')
      .select('num')
      .where('rest_id', '=', r.restaurantId)
      .where('foods_id', '=', FOOD)
      .executeTakeFirstOrThrow();
    expect(wallet.num).toBe(5);
    expect(await row(id)).toMatchObject({ status: 'delivered', to_cupboard: 10, to_wallet: 5 });
    expect(await logs(r.restaurantId, 'fridge.drop')).toEqual([]);
  });

  it('重跑：已交割的不重复交割（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1000 });
    await put(shardId, r.restaurantId, { qty: 2, balance: 100 });
    await deliverDue(t.game.deps, shardId, t.clock.now);
    expect(await deliverDue(t.game.deps, shardId, t.clock.now)).toMatchObject({ delivered: 0, defaulted: 0 });
    expect((await restRow(t, r.restaurantId)).coin).toBe(900);
    expect((await foodNum(t, r.restaurantId, FOOD)).num).toBe(2);
  });

  it('配置里没有这种食材了：cancelled、退回定金、写 futures.refunded', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 1000 });
    const id = await put(shardId, r.restaurantId, { foodsId: 999_999, deposit: 60 });
    expect(await deliverDue(t.game.deps, shardId, t.clock.now)).toMatchObject({ refunded: 1 });
    expect((await row(id)).status).toBe('cancelled');
    expect((await restRow(t, r.restaurantId)).coin).toBe(1060);
    expect(await logs(r.restaurantId, 'futures.refunded')).toEqual([
      { foodsId: 999_999, qty: 2, deposit: 60 },
    ]);
  });

  it('周期任务挂在 restaurant 上：区服关了期货也照常交割；每分钟一个周期', async () => {
    const [job] = futuresJobs(t.game.deps);
    expect(job).toMatchObject({ name: 'futures-deliver', feature: 'restaurant' });
    expect(job!.period(new Date('2026-10-10T04:05:30Z'), config.tuning as never)).toBe('2026-10-10T04:05');
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { futures: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const r = await trader(t, { shardId, coin: 1000 });
    const id = await put(shardId, r.restaurantId, {});
    await job!.run({
      shardId,
      period: 'x',
      now: t.clock.now,
      settings: await t.game.shards.settings(shardId),
      log: { error: () => undefined },
    });
    expect((await row(id)).status).toBe('delivered');
  });

  it('餐厅动态读得到交割和违约', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 150 });
    await put(shardId, r.restaurantId, { balance: 100, dueIn: -2 });
    await put(shardId, r.restaurantId, { balance: 100, dueIn: -1 });
    await deliverDue(t.game.deps, shardId, t.clock.now);
    const feed = await t.game.social.reads.feed(r, { limit: 30 });
    expect(feed.items.map((x) => x.type).sort()).toEqual(['futures.defaulted', 'futures.delivered']);
  });
});
