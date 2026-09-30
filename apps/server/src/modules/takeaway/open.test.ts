import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';

const DAY = '2026-09-30';
const READY = { star_level: 2, renown: 1000 };
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const open = (ctx: RestCtx, way: 'ticket' | 'coin') => t.game.takeaway.open(ctx, { way });

describe('开通（设计文档 §3.1）', () => {
  it('没开通：概览给开通条件和持有的外卖券', async () => {
    const ctx = await newRestaurant(t, { patch: READY, goods: { 263: 1 } });
    expect(await t.game.takeaway.overview(ctx)).toMatchObject({
      opened: false,
      open: { needStar: 2, needRenown: 888, needCoin: 8_880_000, needDiamond: 300, tickets: 1 },
      orders: [],
      deliveries: [],
      riders: [],
      riderCap: 0,
      star: 2,
      renown: 1000,
      now: gameTime(DAY, 12).toISOString(),
    });
  });

  it('用外卖券开通：扣 888 声望和 1 张券，自己成为 1 号骑手；主线第 34 步完成', async () => {
    const ctx = await newRestaurant(t, { patch: { ...READY, main_task_step: 34 }, goods: { 263: 1 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({
      step: 34,
      key: 'takeaway.open',
      done: false,
    });
    expect((await open(ctx, 'ticket')).data).toEqual({ opened: true });
    expect((await restRow(t, ctx.restaurantId)).renown).toBe(112);
    expect(await goodsNum(t, ctx.restaurantId, 263)).toBe(0);
    const v = await t.game.takeaway.overview(ctx);
    expect(v).toMatchObject({
      opened: true,
      riderCap: 1,
      canDouble: false,
      refresh: { cost: 1_000_000, hasJob: false },
    });
    expect(v.riders).toEqual([
      {
        id: expect.any(Number),
        restId: ctx.restaurantId,
        name: expect.any(String),
        self: true,
        level: 1,
        exp: 0,
        needExp: 1300,
        timeSub: 0,
        expAdd: 0,
        coinAdd: 0,
        renownAdd: 0,
        odds: 800,
        maxNum: 1,
        busy: 0,
        dismissCoin: 0,
        dismissExp: 0,
      },
    ]);
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 34, progress: 1, done: true });
  });

  it('用银币和钻石开通', async () => {
    const ctx = await newRestaurant(t, { patch: { ...READY, coin: 9_000_000, diamond: 300 } });
    await open(ctx, 'coin');
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ coin: 120_000, diamond: 0, renown: 112 });
  });

  it('条件：星级、声望、外卖券、银币不够；重复开通；失败时什么都不扣', async () => {
    const low = await newRestaurant(t, { patch: { star_level: 1, renown: 1000 }, goods: { 263: 1 } });
    await expect(open(low, 'ticket')).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 2 },
    });
    const poor = await newRestaurant(t, { patch: { star_level: 2, renown: 887 }, goods: { 263: 1 } });
    await expect(open(poor, 'ticket')).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'renown', need: 888, have: 887 },
    });
    const bare = await newRestaurant(t, { patch: READY });
    await expect(open(bare, 'ticket')).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods' },
    });
    await expect(open(bare, 'coin')).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'coin' } });
    expect((await restRow(t, bare.restaurantId)).renown).toBe(1000);
    expect((await t.game.takeaway.overview(bare)).opened).toBe(false);
    const twice = await newRestaurant(t, { patch: READY, goods: { 263: 2 } });
    await open(twice, 'ticket');
    await expect(open(twice, 'ticket')).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'takeaway' },
    });
    expect(await goodsNum(t, twice.restaurantId, 263)).toBe(1);
  });

  it('区服关闭 takeaway：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { patch: READY, goods: { 263: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { takeaway: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.takeaway.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(open(ctx, 'ticket')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
