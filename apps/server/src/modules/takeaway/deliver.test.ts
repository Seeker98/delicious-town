import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { addOrder, openFor, setWeather } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { grantGoods } from '../store/grant';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

/** 学会南煎丸子（品级 1）、每种食材 5 个、声望 10、已开通、晴天 */
const cook = async (shardId?: number): Promise<{ ctx: RestCtx; rider: number }> => {
  const ctx = await newRestaurant(t, {
    shardId,
    patch: { renown: 10 },
    cookbooks: { 1: 1 },
    foods: { 239: 5, 242: 5, 250: 5 },
  });
  const rider = await openFor(t, ctx);
  await setWeather(t, ctx.shardId, 1);
  return { ctx, rider };
};
const deliver = (ctx: RestCtx, orderId: number, riderId: number, double = false) =>
  t.game.takeaway.deliver(ctx, { orderId, riderId, double });
const foods = async (restId: number) =>
  Promise.all([239, 242, 250].map(async (id) => (await foodNum(t, restId, id)).num));

describe('接单（设计文档 §3.3）', () => {
  it('扣食材和声望；单变成配送中，别人看不到；这一单的数值定下来', async () => {
    const { ctx, rider } = await cook();
    const other = await cook(ctx.shardId);
    const order = await addOrder(t, ctx.shardId);
    const r = await deliver(ctx, order, rider);
    expect(r.data).toEqual({
      id: expect.any(Number),
      orderId: order,
      cookbookId: 1,
      cookbookName: '南煎丸子',
      grade: 1,
      private: false,
      double: false,
      riderId: rider,
      riderName: expect.any(String),
      arriveAt: new Date(t.clock.now.getTime() + 30 * 60_000).toISOString(),
      arrived: false,
      drone: 3,
    });
    expect(await foods(ctx.restaurantId)).toEqual([4, 4, 4]);
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(7);
    expect(
      await t.db
        .selectFrom('takeaway_delivery')
        .selectAll()
        .where('id', '=', r.data.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      coin: 198,
      exp: 13,
      renown: 1,
      success_odds: 820,
      mystery_kinds: 0,
      state: 1,
      private: false,
    });
    const v = await t.game.takeaway.overview(ctx);
    expect(v.deliveries.map((d) => d.id)).toEqual([r.data.id]);
    expect(v.riders[0]!.busy).toBe(1);
    expect((await t.game.takeaway.overview(other.ctx)).orders).toEqual([]);
  });

  it('菜价倍率（240-1）：区服把菜价倍率调到 0.5，外卖银币跟着减半，经验不变', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: shardId,
        override: JSON.stringify({ tuning: { settlement: { dishCoinRate: 0.5 } } }),
      })
      .execute();
    const { ctx, rider } = await cook(shardId);
    const order = await addOrder(t, shardId);
    const r = await deliver(ctx, order, rider);
    const row = await t.db
      .selectFrom('takeaway_delivery')
      .select(['coin', 'exp'])
      .where('id', '=', r.data.id)
      .executeTakeFirstOrThrow();
    // 默认倍率时这一单是 银币 198、经验 13（见第一条）；菜价倍率只压银币（终审 I-1）
    expect(row.coin).toBeGreaterThanOrEqual(98);
    expect(row.coin).toBeLessThanOrEqual(99);
    expect(row.exp).toBe(13);
  });

  it('天气和我的加成算进数值：阴天银币 +10%，外卖之星经验 +30%', async () => {
    const { ctx, rider } = await cook();
    await setWeather(t, ctx.shardId, 2);
    await grantGoods(t.db, config, ctx.restaurantId, 368, 1, t.clock.now);
    const r = await deliver(ctx, await addOrder(t, ctx.shardId), rider);
    expect(
      await t.db
        .selectFrom('takeaway_delivery')
        .select(['coin', 'exp'])
        .where('id', '=', r.data.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ coin: 217, exp: 17 });
  });

  it('加料要持有使命必达：食材翻倍', async () => {
    const { ctx, rider } = await cook();
    const order = await addOrder(t, ctx.shardId);
    await expect(deliver(ctx, order, rider, true)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'double' },
    });
    await grantGoods(t.db, config, ctx.restaurantId, 370, 1, t.clock.now);
    expect((await t.game.takeaway.overview(ctx)).canDouble).toBe(true);
    expect((await deliver(ctx, order, rider, true)).data.double).toBe(true);
    expect(await foods(ctx.restaurantId)).toEqual([3, 3, 3]);
  });

  it('记下用了几种神秘食材', async () => {
    const ctx = await newRestaurant(t, {
      patch: { renown: 10 },
      cookbooks: { 4: 5 },
      foods: { 251: 1, 466: 1, 415: 1 },
    });
    const rider = await openFor(t, ctx);
    await setWeather(t, ctx.shardId, 1);
    const r = await deliver(ctx, await addOrder(t, ctx.shardId, { cookbookId: 4 }), rider);
    expect(
      await t.db
        .selectFrom('takeaway_delivery')
        .select('mystery_kinds')
        .where('id', '=', r.data.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ mystery_kinds: 1 });
  });

  it('条件：单没了、被接走、骑手不是我的、骑手满了、没学会、声望、食材；失败时什么都不扣', async () => {
    const { ctx, rider } = await cook();
    const other = await cook(ctx.shardId);
    const gone = [
      999_999,
      await addOrder(t, ctx.shardId, { owner: other.ctx.restaurantId }),
      await addOrder(t, ctx.shardId, { expiresIn: -1 }),
    ];
    for (const id of gone)
      await expect(deliver(ctx, id, rider)).rejects.toMatchObject({ params: { reason: 'order_gone' } });
    await expect(deliver(ctx, await addOrder(t, ctx.shardId, { state: 2 }), rider)).rejects.toMatchObject({
      params: { reason: 'order_taken' },
    });
    const order = await addOrder(t, ctx.shardId);
    await expect(deliver(ctx, order, other.rider)).rejects.toMatchObject({
      params: { reason: 'rider_gone' },
    });
    await expect(
      deliver(ctx, await addOrder(t, ctx.shardId, { cookbookId: 3 }), rider),
    ).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'not_learned' },
    });
    await expect(
      deliver(ctx, await addOrder(t, ctx.shardId, { needRenown: 11 }), rider),
    ).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'renown', need: 11, have: 10 },
    });
    await expect(deliver(ctx, await addOrder(t, ctx.shardId, { grade: 6 }), rider)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'foods', need: 6, have: 5 },
    });
    expect(await foods(ctx.restaurantId)).toEqual([5, 5, 5]);
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(10);
    await deliver(ctx, order, rider);
    await expect(deliver(ctx, await addOrder(t, ctx.shardId), rider)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'rider_busy', max: 1 },
    });
  });

  it('没开通不能接单', async () => {
    const ctx = await newRestaurant(t, { cookbooks: { 1: 1 } });
    await expect(deliver(ctx, await addOrder(t, ctx.shardId), 1)).rejects.toMatchObject({
      params: { reason: 'takeaway_closed' },
    });
  });

  it('两个人同时接同一张公共单：只有一个成功，另一个报 order_taken，食材和声望一点没少（Review Focus 1）', async () => {
    const a = await cook();
    const b = await cook(a.ctx.shardId);
    const order = await addOrder(t, a.ctx.shardId);
    const r = await Promise.allSettled([deliver(a.ctx, order, a.rider), deliver(b.ctx, order, b.rider)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { params: { reason: 'order_taken' } },
    });
    const loser = r[0]!.status === 'rejected' ? a.ctx : b.ctx;
    expect(await foods(loser.restaurantId)).toEqual([5, 5, 5]);
    expect((await restRow(t, loser.restaurantId)).renown).toBe(10);
  });

  it('配送中的单对应的食谱被删了（老街道修订，问题记录 284）：外卖页照常打开，菜名为空', async () => {
    const { ctx, rider } = await cook();
    const order = await addOrder(t, ctx.shardId);
    await deliver(ctx, order, rider);
    await t.db.updateTable('takeaway_order').set({ cookbook_id: 999_999 }).where('id', '=', order).execute();
    const v = await t.game.takeaway.overview(ctx);
    expect(v.deliveries).toHaveLength(1);
    expect(v.deliveries[0]).toMatchObject({ cookbookId: 999_999, cookbookName: '' });
  });
});
