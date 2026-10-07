import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { originalDishConfig, testConfig } from '../../../test/config';
import {
  befriend,
  createTestGame,
  goodsNum,
  newPair,
  newRestaurant,
  restRow,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { eventCount, questIn, showQuest } from '../../../test/quests';
import { addOrder, addRider, openFor, setWeather, type OrderInit } from '../../../test/takeaway';
import type { RestCtx } from '../../core/deps';
import { grantGoods } from '../store/grant';
import { GOODS } from '@dt/config';
import { cid, fid, gid } from '../../../test/items';

const DAY = '2026-09-30';
const config = testConfig();
let rngValues: number[] = [0.4];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues), config: originalDishConfig() });
});
afterAll(() => t.close());
beforeEach(() => {
  rngValues = [0.4];
  t.clock.set(gameTime(DAY, 12));
});

const COOK: NewRestaurantOptions = {
  patch: { renown: 10, diamond: 10 },
  cookbooks: { [cid('南煎丸子')]: 1 },
  foods: { [fid('猪肉')]: 20, [fid('鸡蛋')]: 20, [fid('香葱')]: 20 },
};
/** 学会南煎丸子、食材充足、声望 10、钻石 10、已开通、晴天 */
const cook = async (opts: NewRestaurantOptions = {}): Promise<{ ctx: RestCtx; rider: number }> => {
  const ctx = await newRestaurant(t, { ...COOK, ...opts, patch: { ...COOK.patch, ...opts.patch } });
  const rider = await openFor(t, ctx);
  await setWeather(t, ctx.shardId, 1);
  return { ctx, rider };
};
/** 接一张单，返回配送 id */
const take = async (ctx: RestCtx, rider: number, o: OrderInit = {}) =>
  (
    await t.game.takeaway.deliver(ctx, {
      orderId: await addOrder(t, ctx.shardId, o),
      riderId: rider,
      double: false,
    })
  ).data.id;
const claim = (ctx: RestCtx, deliveryId: number, drone = false) =>
  t.game.takeaway.claim(ctx, { deliveryId, drone });
const later = (min = 30) => t.clock.advance(min * 60_000);
const deliveryState = async (id: number) =>
  (await t.db.selectFrom('takeaway_delivery').select('state').where('id', '=', id).executeTakeFirstOrThrow())
    .state;

describe('领取（设计文档 §3.4）', () => {
  it('成功：银币、经验、声望、奖池一件；骑手经验；单完成；主线「完成 3 次外卖配送」和活跃"配送外卖"', async () => {
    // 活跃"配送外卖"要 2 星
    const { ctx, rider } = await cook({ patch: { star_level: 2 } });
    const id = await take(ctx, rider);
    later();
    expect((await claim(ctx, id)).data).toEqual({
      deliveryId: id,
      success: true,
      forced: false,
      drone: false,
      reason: null,
      reasonId: null,
      coin: 198,
      exp: 13,
      renown: 1,
      goods: { id: GOODS.mysteryTicket, num: 1 },
      riderExp: 6,
      riderLevel: 1,
      customer: null,
    });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 198, exp: 13, renown: 8 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mysteryTicket)).toBe(1);
    expect(await deliveryState(id)).toBe(2);
    const v = await t.game.takeaway.overview(ctx);
    expect(v.deliveries).toEqual([]);
    expect(v.riders[0]).toMatchObject({ exp: 6, busy: 0 });
    await showQuest(t, ctx.restaurantId, 2142);
    expect(questIn(await t.game.task.tasks(ctx), 2142)).toMatchObject({
      key: 'takeaway.deliver',
      progress: 1,
    });
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '配送外卖')!.count).toBe(1);
  });

  it('按店所在的街道另记一次配送（问题记录 515：在杂碎街送外卖）', async () => {
    const { ctx, rider } = await cook({ patch: { star_level: 2, street_id: 29 } });
    const id = await take(ctx, rider);
    later();
    await claim(ctx, id);
    expect(await eventCount(t, ctx.restaurantId, 'takeaway.deliver.street.29')).toBe(1);
  });

  it('没到不能领；无人机随时领：花 2g+1 钻石、必定成功、骑手经验 ×2、礼券多 g 张', async () => {
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider);
    await expect(claim(ctx, id)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: {
        reason: 'not_arrived',
        arriveAt: new Date(t.clock.now.getTime() + 30 * 60_000).toISOString(),
      },
    });
    expect((await claim(ctx, id, true)).data).toMatchObject({
      success: true,
      drone: true,
      riderExp: 12,
      goods: { id: GOODS.mysteryTicket, num: 2 },
    });
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(7);
    // 支线“外卖进阶”（问题记录 515）
    expect(await eventCount(t, ctx.restaurantId, 'takeaway.drone')).toBe(1);
  });

  it('送成 5 星以上的单另记一次；4 星、送失败的不记（问题记录 515 支线“外卖进阶”）', async () => {
    const { ctx, rider } = await cook({
      patch: { renown: 1000 },
      foods: { [fid('猪肉')]: 100, [fid('鸡蛋')]: 100, [fid('香葱')]: 100 },
    });
    const n = () => eventCount(t, ctx.restaurantId, 'takeaway.grade5');
    for (const [grade, rng, want] of [
      [4, 0.4, 0],
      [5, 0.9, 0],
      [5, 0.4, 1],
      [7, 0.4, 2],
    ] as const) {
      rngValues = [rng];
      const id = await take(ctx, rider, { grade, needRenown: 0 });
      later();
      await claim(ctx, id);
      expect(await n()).toBe(want);
    }
    expect(await eventCount(t, ctx.restaurantId, 'takeaway.drone')).toBe(0);
  });

  it('失败：经验减半，没有银币、声望、道具；骑手经验 ×2；给失败原因。有咕咕经验不减', async () => {
    rngValues = [0.9];
    const { ctx, rider } = await cook();
    const a = await take(ctx, rider);
    later();
    expect((await claim(ctx, a)).data).toMatchObject({
      success: false,
      coin: 0,
      exp: 6,
      renown: 0,
      goods: null,
      riderExp: 12,
      reason: '顾客退单了!',
      reasonId: 7,
    });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 0, renown: 7 });
    expect(await deliveryState(a)).toBe(3);
    await grantGoods(t.db, config, ctx.restaurantId, gid('咕咕'), 1, t.clock.now);
    const b = await take(ctx, rider);
    later();
    expect((await claim(ctx, b)).data).toMatchObject({ success: false, exp: 13 });
  });

  it('边牧：失败时 30% 改判成功', async () => {
    rngValues = [0.9];
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider);
    await grantGoods(t.db, config, ctx.restaurantId, GOODS.borderCollie, 1, t.clock.now);
    later();
    rngValues = [0.9, 0.1, 0.4, 0.4, 0.4];
    expect((await claim(ctx, id)).data).toMatchObject({
      success: true,
      forced: true,
      coin: 198,
      goods: { id: GOODS.mysteryTicket, num: 1 },
    });
  });

  it('私人单必定成功，经验 ×1.5', async () => {
    rngValues = [0.9];
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider, { owner: ctx.restaurantId });
    later();
    expect((await claim(ctx, id)).data).toMatchObject({
      success: true,
      exp: 19,
      goods: { id: gid('蟹币'), num: 1 },
    });
  });

  it('神秘顾客：成功时遇到珊迪，写新闻', async () => {
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider);
    later();
    rngValues = [0.01];
    expect((await claim(ctx, id)).data).toMatchObject({ success: true, customer: gid('珊迪') });
    expect(await goodsNum(t, ctx.restaurantId, gid('珊迪'))).toBe(1);
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(news).toEqual([{ type: 'takeaway.customer', params: { goodsId: gid('珊迪') } }]);
  });

  it('骑手是好友：我拿 0.9 的银币和经验，他的店拿 1/9 回扣，他的骑手经验加上', async () => {
    const [a, b] = await newPair(t, COOK, {});
    await befriend(t, a.restaurantId, b.restaurantId);
    await openFor(t, a);
    await setWeather(t, a.shardId, 1);
    const rider = await addRider(t, a.restaurantId, b.restaurantId);
    const id = await take(a, rider);
    later();
    expect((await claim(a, id)).data).toMatchObject({ success: true, coin: 178, exp: 11, riderExp: 6 });
    expect(await restRow(t, b.restaurantId)).toMatchObject({ coin: 19, exp: 1 });
    expect(
      await t.db.selectFrom('takeaway_rider').select('exp').where('id', '=', rider).executeTakeFirstOrThrow(),
    ).toEqual({ exp: 6 });
  });

  it('两家店互为骑手、同时领取：都完成，不死锁，各拿对方的回扣（Review Focus 2）', async () => {
    const [a, b] = await newPair(t, COOK, COOK);
    await befriend(t, a.restaurantId, b.restaurantId);
    await openFor(t, a);
    await openFor(t, b);
    await setWeather(t, a.shardId, 1);
    const ra = await addRider(t, a.restaurantId, b.restaurantId);
    const rb = await addRider(t, b.restaurantId, a.restaurantId);
    const da = await take(a, ra);
    const db = await take(b, rb);
    later();
    const r = await Promise.all([claim(a, da), claim(b, db)]);
    expect(r.map((x) => x.data.success)).toEqual([true, true]);
    expect((await restRow(t, a.restaurantId)).coin).toBe(178 + 19);
    expect((await restRow(t, b.restaurantId)).coin).toBe(178 + 19);
  });

  it('全部领取：只领已到的；好友骑手那一单的回扣照发（Review Focus 5）', async () => {
    const [a, b] = await newPair(t, COOK, {});
    await befriend(t, a.restaurantId, b.restaurantId);
    const self = await openFor(t, a);
    await t.db.updateTable('takeaway_rider').set({ level: 5 }).where('id', '=', self).execute();
    await setWeather(t, a.shardId, 1);
    const friend = await addRider(t, a.restaurantId, b.restaurantId);
    const d1 = await take(a, self);
    const d2 = await take(a, friend);
    const d3 = await take(a, self, { needMinutes: 90 });
    later();
    const r = await t.game.takeaway.claimAll(a);
    expect(r.data.map((x) => x.deliveryId)).toEqual([d1, d2]);
    expect(await deliveryState(d3)).toBe(1);
    expect((await restRow(t, b.restaurantId)).coin).toBeGreaterThan(0);
  });

  it('配送中的单过了有效期仍能领取（Review Focus 4）', async () => {
    const { ctx, rider } = await cook();
    const id = await take(ctx, rider, { expiresIn: 5 });
    later(60);
    expect((await claim(ctx, id)).data.success).toBe(true);
  });

  it('自己的骑手升到 2 级：可雇上限 +1', async () => {
    const { ctx, rider } = await cook();
    await t.db.updateTable('takeaway_rider').set({ exp: 1297 }).where('id', '=', rider).execute();
    const id = await take(ctx, rider);
    later();
    expect((await claim(ctx, id)).data.riderLevel).toBe(2);
    const v = await t.game.takeaway.overview(ctx);
    expect(v.riders[0]).toMatchObject({ level: 2, exp: 3 });
    expect(v.riderCap).toBe(2);
  });

  it('领过的、别人的配送报 delivery_gone', async () => {
    const { ctx, rider } = await cook();
    const other = await cook({ shardId: ctx.shardId });
    const id = await take(ctx, rider);
    later();
    await expect(claim(other.ctx, id)).rejects.toMatchObject({ params: { reason: 'delivery_gone' } });
    await claim(ctx, id);
    await expect(claim(ctx, id)).rejects.toMatchObject({ params: { reason: 'delivery_gone' } });
  });

  it('两次全部领取同时进行：都成功返回，每单只领一次（终审 I1）', async () => {
    const { ctx, rider } = await cook();
    await t.db.updateTable('takeaway_rider').set({ level: 10 }).where('id', '=', rider).execute();
    const ids = [await take(ctx, rider), await take(ctx, rider), await take(ctx, rider)];
    later();
    const [a, b] = await Promise.all([t.game.takeaway.claimAll(ctx), t.game.takeaway.claimAll(ctx)]);
    expect([...a.data, ...b.data].map((x) => x.deliveryId).sort((x, y) => x - y)).toEqual(ids);
  });
});
