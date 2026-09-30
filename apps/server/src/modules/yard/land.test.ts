import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('菜园概览和开垦（规格书 08 §8.1）', () => {
  it('新店没有土地；下一块 100,000；体力、声望、种子、肥料持有', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 50, renown: 3 }, goods: { 427: 2 } });
    await t.db.insertInto('rest_seed').values({ rest_id: ctx.restaurantId, seed_id: 1, num: 4 }).execute();
    const y = await t.game.yard.overview(ctx);
    expect(y).toMatchObject({
      lands: [],
      maxLands: 9,
      nextLandCoin: 100_000,
      coin: 50,
      strength: 100,
      renown: 3,
      seeds: [{ seedId: 1, num: 4 }],
    });
    expect(y.fertilizers).toEqual([
      { goodsId: 427, minutes: 20, num: 2 },
      { goodsId: 428, minutes: 60, num: 0 },
    ]);
  });

  it('开垦费用 50,000 × 2ⁿ 递增；新土地 1 级 0 经验；银币不够报 NOT_ENOUGH', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 300_000 } });
    expect((await t.game.yard.expand(ctx)).data).toEqual({ no: 1, coin: 100_000 });
    expect((await t.game.yard.expand(ctx)).data).toEqual({ no: 2, coin: 200_000 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(0);
    const y = await t.game.yard.overview(ctx);
    expect(y.lands).toEqual([
      { no: 1, level: 1, exp: 0, expNext: 1000, bonus: 0, plant: null },
      { no: 2, level: 1, exp: 0, expNext: 1000, bonus: 0, plant: null },
    ]);
    expect(y.nextLandCoin).toBe(400_000);
    await expect(t.game.yard.expand(ctx)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin', need: 400_000 },
    });
  });

  it('满 9 块报 LIMIT_REACHED lands；满级土地没有下一级、加成 72%', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000_000 } });
    for (let no = 1; no <= 9; no++) {
      await t.db
        .insertInto('yard_land')
        .values({ rest_id: ctx.restaurantId, no, level: no === 9 ? 10 : 1 })
        .execute();
    }
    await expect(t.game.yard.expand(ctx)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'lands', max: 9 },
    });
    const y = await t.game.yard.overview(ctx);
    expect(y.nextLandCoin).toBeNull();
    expect(y.lands[8]).toMatchObject({ no: 9, level: 10, expNext: null, bonus: 72 });
  });

  it('主线第 28 步「开垦一块菜园」不再跳过，开垦后完成', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000, main_task_step: 28 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 28, key: 'yard.lands', done: false });
    await t.game.yard.expand(ctx);
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 28, progress: 1, done: true });
  });

  it('区服关闭 yard：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { yard: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.yard.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.yard.expand(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
