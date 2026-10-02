import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

const DAY = '2026-09-30';
const STRONG = { attr_cook: 20, attr_cutting: 20, attr_fire: 20, attr_season: 10 };
let t: TestGame;
let rngValues: number[] = [0.4];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());
beforeEach(() => {
  rngValues = [0.4];
  t.clock.set(gameTime(DAY, 12));
});

const setDaily = (restId: number, key: string, count: number) =>
  t.db.insertInto('daily_counter').values({ rest_id: restId, day: DAY, key, count }).execute();
const setBest = (restId: number, best: number) =>
  t.db.insertInto('tower_state').values({ rest_id: restId, best_floor: best }).execute();

describe('厨塔概览', () => {
  it('新店：1 层解锁、2 层没有；今日 5 次；守塔人厨力；还没换菜', async () => {
    const ctx = await newRestaurant(t, { patch: STRONG });
    const v = await t.game.tower.overview(ctx);
    expect(v).toMatchObject({
      left: 5,
      dailyTotal: 5,
      tickets: 0,
      bestFloor: 0,
      level: 1,
      hour: 12,
      nightFloor: 3,
      openHour: 6,
      testCost: 1,
      power: 70,
    });
    expect(v.floors).toHaveLength(10);
    expect(v.floors[0]).toMatchObject({
      floor: 1,
      name: '见习模范餐厅',
      title: '见习守护者',
      power: 13,
      left: 10,
      maxTimes: 10,
      unlocked: true,
      cost: 5,
      mc: null,
    });
    expect(v.floors[1]).toMatchObject({ floor: 2, unlocked: false, cost: 6 });
  });
});

describe('挑战（设计文档 §3.2）', () => {
  it('胜：扣 层+4 体力；声望 +(层+6)；随机奖励"层"次；最高层更新；主线第 27 步、活跃"厨塔挑战"', async () => {
    const ctx = await newRestaurant(t, { patch: { ...STRONG, level: 5, main_task_step: 27 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({
      step: 27,
      key: 'tower.challenge',
      done: false,
    });
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect(r.data).toMatchObject({
      win: true,
      renown: 7,
      test: false,
      rank: null,
      awards: [{ kind: 'coin', id: null, num: 600, lucky: false }],
    });
    expect(r.data.me).toMatchObject({ power: 70, scores: [20.4, 19.4, 15.4, 22.4, 7.4], sum: 85 });
    expect(r.data.them).toEqual({
      name: '见习模范餐厅',
      power: 13,
      scores: [3.8, 3.9, 3.3, 4.1, 1.9],
      sum: 17,
    });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ strength: 95, renown: 7, coin: 600 });
    const v = await t.game.tower.overview(ctx);
    expect(v).toMatchObject({ bestFloor: 1, left: 4 });
    expect(v.floors[0]!.left).toBe(9);
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 27, progress: 1, done: true });
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '厨塔挑战')!.count).toBe(1);
  });

  it('负：声望 +6，没有奖励，最高层不变', async () => {
    const ctx = await newRestaurant(t);
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect(r.data).toMatchObject({ win: false, renown: 6, awards: [] });
    expect((await t.game.tower.overview(ctx)).bestFloor).toBe(0);
  });

  it('试打只扣 1 体力，没有奖励声望、不计次数、不算打赢；今日次数用完后仍能试打（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { patch: STRONG });
    await setDaily(ctx.restaurantId, 'tower.done', 5);
    const r = await t.game.tower.challenge(ctx, { floor: 1, test: true });
    expect(r.data).toMatchObject({ win: true, renown: 0, awards: [], test: true });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ strength: 99, renown: 0, coin: 0 });
    expect(await t.game.tower.overview(ctx)).toMatchObject({ bestFloor: 0, left: 0 });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: false })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'tower', max: 5 },
    });
  });

  it('挑战券：一次只能用 1 张，用了当天多一次', async () => {
    const ctx = await newRestaurant(t, { goods: { 136: 2 } });
    await setDaily(ctx.restaurantId, 'tower.done', 5);
    await expect(t.game.store.use(ctx, { goodsId: 136, num: 2 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_batch' },
    });
    await t.game.store.use(ctx, { goodsId: 136, num: 1 });
    expect(await t.game.tower.overview(ctx)).toMatchObject({ left: 1, dailyTotal: 6, tickets: 1 });
    await t.game.tower.challenge(ctx, { floor: 1, test: false });
    expect((await t.game.tower.overview(ctx)).left).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 136)).toBe(1);
  });

  it('解锁：2 层要 11 级且打赢过 1 层', async () => {
    const low = await newRestaurant(t, { patch: { level: 10 } });
    await setBest(low.restaurantId, 1);
    await expect(t.game.tower.challenge(low, { floor: 2, test: true })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'floor_locked', minLevel: 11, needFloor: 1 },
    });
    const fresh = await newRestaurant(t, { patch: { level: 11 } });
    await expect(t.game.tower.challenge(fresh, { floor: 2, test: true })).rejects.toMatchObject({
      params: { reason: 'floor_locked' },
    });
    await setBest(fresh.restaurantId, 1);
    expect((await t.game.tower.challenge(fresh, { floor: 2, test: true })).data.test).toBe(true);
  });

  it('夜间：4 层以上 6 点前不能挑战，3 层可以', async () => {
    t.clock.set(gameTime(DAY, 3));
    const ctx = await newRestaurant(t, { patch: { level: 31 } });
    await setBest(ctx.restaurantId, 3);
    await expect(t.game.tower.challenge(ctx, { floor: 4, test: true })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'tower_night', openHour: 6 },
    });
    expect((await t.game.tower.challenge(ctx, { floor: 3, test: true })).data.test).toBe(true);
    t.clock.set(gameTime(DAY, 6));
    expect((await t.game.tower.challenge(ctx, { floor: 4, test: true })).data.test).toBe(true);
  });

  it('守塔人每日次数：8 层每人每天 1 次', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 71 } });
    await setBest(ctx.restaurantId, 7);
    await t.game.tower.challenge(ctx, { floor: 8, test: false });
    await expect(t.game.tower.challenge(ctx, { floor: 8, test: false })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'watchman', max: 1, name: t.deps.config.towerFloors.get(8)!.name },
    });
    expect((await t.game.tower.overview(ctx)).floors[7]!.left).toBe(0);
  });

  it('层号越界报 VALIDATION_FAILED；体力不够报 NOT_ENOUGH，什么都不变', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 3 } });
    await expect(t.game.tower.challenge(ctx, { floor: 11, test: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'floor' },
    });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'strength', need: 5 },
    });
    expect((await t.game.tower.overview(ctx)).left).toBe(5);
  });

  it('区服关闭 tower：接口报 FEATURE_DISABLED，挑战券不能用', async () => {
    const ctx = await newRestaurant(t, { goods: { 136: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { tower: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.tower.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.tower.challenge(ctx, { floor: 1, test: true })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    await expect(t.game.store.use(ctx, { goodsId: 136, num: 1 })).rejects.toMatchObject({
      code: 'NOT_USABLE',
    });
  });
});
