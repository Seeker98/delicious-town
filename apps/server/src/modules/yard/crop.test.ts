import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay, gameTime, sequenceRng } from '@dt/shared';
import {
  createTestGame,
  foodNum,
  goodsNum,
  newRestaurant,
  restRow,
  type NewRestaurantOptions,
  type TestGame,
} from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';

let t: TestGame;
/** 随机数固定 0：铲除必返还种子 */
let lucky: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  lucky = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await lucky.close();
});

const MIN = 60_000;
const noon = () => gameTime(gameDay(new Date()), 12);

/** 一家店 + 1 号地（等级 landLevel）+ 2 颗大米种子（1 号：幼年 24、育苗 36、成长 60 分钟，产量 20） */
async function withLand(g: TestGame, opts: NewRestaurantOptions = {}, landLevel = 1) {
  const ctx = await newRestaurant(g, opts);
  await g.db.insertInto('yard_land').values({ rest_id: ctx.restaurantId, no: 1, level: landLevel }).execute();
  await g.db.insertInto('rest_seed').values({ rest_id: ctx.restaurantId, seed_id: 1, num: 2 }).execute();
  return ctx;
}
const plantOf = (g: TestGame, id: number) =>
  g.db.selectFrom('yard_plant').selectAll().where('id', '=', id).executeTakeFirst();
const landOf = (g: TestGame, restId: number) =>
  g.db
    .selectFrom('yard_land')
    .selectAll()
    .where('rest_id', '=', restId)
    .where('no', '=', 1)
    .executeTakeFirstOrThrow();
async function seedNum(g: TestGame, restId: number, seedId: number) {
  const r = await g.db
    .selectFrom('rest_seed')
    .select('num')
    .where('rest_id', '=', restId)
    .where('seed_id', '=', seedId)
    .executeTakeFirst();
  return r?.num ?? 0;
}
async function basketNum(g: TestGame, restId: number, foodsId: number) {
  const r = await g.db
    .selectFrom('yard_basket')
    .select('num')
    .where('rest_id', '=', restId)
    .where('foods_id', '=', foodsId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

describe('作物（规格书 08 §8.3）', () => {
  it('播种 → 浇水三次 → 收获进菜篮 → 存进橱柜；土地经验、收益、2 级地产量 +8%；主线第 29 步', async () => {
    t.clock.set(noon());
    const ctx = await withLand(t, {}, 2);
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    expect(await seedNum(t, ctx.restaurantId, 1)).toBe(1);
    expect(await plantOf(t, data.plantId)).toMatchObject({
      stage: 1,
      harvest_num: 21,
      harvest_max: 21,
      foods_id: 101,
      shard_id: ctx.shardId,
    });
    await expect(t.game.yard.water(ctx, { plantId: data.plantId })).rejects.toMatchObject({
      params: { reason: 'no_water' },
    });
    for (const minutes of [24, 36, 60]) {
      t.clock.advance(minutes * MIN);
      await t.game.yard.water(ctx, { plantId: data.plantId });
    }
    expect((await plantOf(t, data.plantId))!.stage).toBe(4);
    const r = await t.game.yard.reap(ctx, { plantId: data.plantId });
    expect(r.data).toEqual({ foodsId: 101, num: 21, stolen: false, punished: null });
    expect(await plantOf(t, data.plantId)).toBeUndefined();
    expect(await t.game.yard.basket(ctx)).toEqual({ items: [{ foodsId: 101, num: 21 }] });
    expect(r.events).toContainEqual({ type: 'gain', kind: 'basket', num: 21, id: 101 });
    // 土地经验：播种 10 + 浇水 5×3 + 收获 20
    expect(await landOf(t, ctx.restaurantId)).toMatchObject({ level: 2, exp: 45 });
    // 等级 1、自己的地：系数 5。播种 5 银币 10 经验；浇水各 5 / 5；收获 10 银币、15 + 食材等级 1 经验
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ strength: 95, coin: 30, exp: 41 });
    await showQuest(t, ctx.restaurantId, 2102);
    expect(questIn(await t.game.task.tasks(ctx), 2102)).toMatchObject({ done: true });

    const s = await t.game.yard.storeBasket(ctx, { foodsId: 101, num: 21 });
    expect(s.data).toEqual({ stored: 21, dropped: 0 });
    expect(s.events).toContainEqual({ type: 'loss', kind: 'basket', num: 21, id: 101 });
    expect(await basketNum(t, ctx.restaurantId, 101)).toBe(0);
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(21);
  });

  it('播种检查：不是种子、没开垦、种子不够、地上已有作物；失败时种子不扣', async () => {
    const ctx = await withLand(t);
    await expect(t.game.yard.plant(ctx, { landNo: 1, seedId: 9999 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'no_seed' },
    });
    await expect(t.game.yard.plant(ctx, { landNo: 2, seedId: 1 })).rejects.toMatchObject({
      params: { reason: 'no_land' },
    });
    await expect(t.game.yard.plant(ctx, { landNo: 1, seedId: 5 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'seed', id: 5, need: 1, have: 0 },
    });
    await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    await expect(t.game.yard.plant(ctx, { landNo: 1, seedId: 1 })).rejects.toMatchObject({
      params: { reason: 'land_busy' },
    });
    expect(await seedNum(t, ctx.restaurantId, 1)).toBe(1);
  });

  it('体力不够：报 NOT_ENOUGH strength，种子不扣', async () => {
    const ctx = await withLand(t, { patch: { strength: 0 } });
    await expect(t.game.yard.plant(ctx, { landNo: 1, seedId: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'strength' },
    });
    expect(await seedNum(t, ctx.restaurantId, 1)).toBe(2);
  });

  it('有虫先除虫、有草先除草；除虫 −1、除草清零；没虫没草报错', async () => {
    t.clock.set(noon());
    const ctx = await withLand(t);
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    await t.db.updateTable('yard_plant').set({ worm: 2, grass: 3 }).where('id', '=', plantId).execute();
    t.clock.advance(24 * MIN);
    await expect(t.game.yard.water(ctx, { plantId })).rejects.toMatchObject({
      params: { reason: 'has_worm' },
    });
    await t.game.yard.deworm(ctx, { plantId });
    expect((await plantOf(t, plantId))!.worm).toBe(1);
    await t.game.yard.deworm(ctx, { plantId });
    await expect(t.game.yard.deworm(ctx, { plantId })).rejects.toMatchObject({
      params: { reason: 'no_worm' },
    });
    await expect(t.game.yard.water(ctx, { plantId })).rejects.toMatchObject({
      params: { reason: 'has_grass' },
    });
    await t.game.yard.weed(ctx, { plantId });
    expect((await plantOf(t, plantId))!.grass).toBe(0);
    await expect(t.game.yard.weed(ctx, { plantId })).rejects.toMatchObject({
      params: { reason: 'no_grass' },
    });
    await t.game.yard.water(ctx, { plantId });
    expect((await plantOf(t, plantId))!.stage).toBe(2);
    // 播种 10 + 除虫 5×2 + 除草 5 + 浇水 5
    expect((await landOf(t, ctx.restaurantId)).exp).toBe(30);
  });

  it('干涸时浇水：解除干涸、本阶段 −5 分钟，到原时长一半就不再减；收获期只解除干涸（计划裁定 4）', async () => {
    t.clock.set(noon());
    const ctx = await withLand(t);
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    await t.db.updateTable('yard_plant').set({ dry: 3 }).where('id', '=', plantId).execute();
    expect((await t.game.yard.water(ctx, { plantId })).data).toEqual({ stage: 1 });
    expect(await plantOf(t, plantId)).toMatchObject({ stage: 1, dry: 0, infancy: 19 });
    await t.db.updateTable('yard_plant').set({ dry: 1, infancy: 16 }).where('id', '=', plantId).execute();
    await t.game.yard.water(ctx, { plantId });
    expect(await plantOf(t, plantId)).toMatchObject({ dry: 0, infancy: 16 });
    await t.db
      .updateTable('yard_plant')
      .set({ dry: 2, stage: 4, stage_at: t.clock.now })
      .where('id', '=', plantId)
      .execute();
    await t.game.yard.water(ctx, { plantId });
    expect(await plantOf(t, plantId)).toMatchObject({ stage: 4, dry: 0, harvest: 1440 });
  });

  it('施肥：扣 1 个肥料抵扣本阶段时间；剩余时间不够报 feed_useless；不是肥料报 VALIDATION_FAILED', async () => {
    t.clock.set(noon());
    const ctx = await withLand(t, { goods: { 427: 3, 428: 1 } });
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    expect((await t.game.yard.feed(ctx, { plantId, goodsId: 427 })).data).toEqual({ feedMin: 20 });
    expect(await goodsNum(t, ctx.restaurantId, 427)).toBe(2);
    t.clock.advance(4 * MIN);
    await t.game.yard.water(ctx, { plantId });
    expect(await plantOf(t, plantId)).toMatchObject({ stage: 2, feed_min: 0 });
    await expect(t.game.yard.feed(ctx, { plantId, goodsId: 428 })).rejects.toMatchObject({
      params: { reason: 'feed_useless' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 428)).toBe(1);
    await expect(t.game.yard.feed(ctx, { plantId, goodsId: 18 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_fertilizer' },
    });
  });

  it('铲除：任何阶段都能铲；随机数 0 时返还 1 颗种子；地空出来可以再种', async () => {
    const ctx = await withLand(lucky);
    const { data } = await lucky.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    expect((await lucky.game.yard.remove(ctx, { plantId: data.plantId })).data).toEqual({ seedBack: true });
    expect(await seedNum(lucky, ctx.restaurantId, 1)).toBe(2);
    expect(await plantOf(lucky, data.plantId)).toBeUndefined();
    await lucky.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
  });

  it('收获检查：不在收获期、有虫、有草；别人的作物 id 报 no_plant', async () => {
    const ctx = await withLand(t);
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    await expect(t.game.yard.reap(ctx, { plantId })).rejects.toMatchObject({
      params: { reason: 'not_ripe' },
    });
    await t.db.updateTable('yard_plant').set({ stage: 4, worm: 1 }).where('id', '=', plantId).execute();
    await expect(t.game.yard.reap(ctx, { plantId })).rejects.toMatchObject({
      params: { reason: 'has_worm' },
    });
    await t.db.updateTable('yard_plant').set({ worm: 0, grass: 1 }).where('id', '=', plantId).execute();
    await expect(t.game.yard.reap(ctx, { plantId })).rejects.toMatchObject({
      params: { reason: 'has_grass' },
    });
    const other = await newRestaurant(t, { shardId: ctx.shardId });
    await expect(t.game.yard.remove(other, { plantId })).rejects.toMatchObject({
      params: { reason: 'no_plant' },
    });
  });

  it('枯叶期只能铲除：浇水、施肥、除虫、除草、收获都报 withered，什么都不扣（Review Focus 1）', async () => {
    const ctx = await withLand(t, { goods: { 427: 1 } });
    const { data } = await t.game.yard.plant(ctx, { landNo: 1, seedId: 1 });
    const plantId = data.plantId;
    await t.db
      .updateTable('yard_plant')
      .set({ stage: 5, worm: 1, grass: 1 })
      .where('id', '=', plantId)
      .execute();
    const calls = [
      () => t.game.yard.water(ctx, { plantId }),
      () => t.game.yard.feed(ctx, { plantId, goodsId: 427 }),
      () => t.game.yard.deworm(ctx, { plantId }),
      () => t.game.yard.weed(ctx, { plantId }),
      () => t.game.yard.reap(ctx, { plantId }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'withered' } });
    }
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(99);
    expect(await goodsNum(t, ctx.restaurantId, 427)).toBe(1);
    await t.game.yard.remove(ctx, { plantId });
    expect(await plantOf(t, plantId)).toBeUndefined();
  });
});

describe('菜篮（设计文档 §3.4）', () => {
  it('橱柜格子满时进冰箱，冰箱满了丢弃并记日志；菜篮照扣（Review Focus 3）；菜篮不够报 NOT_ENOUGH basket', async () => {
    const ctx = await newRestaurant(t, { patch: { cupboard_num: 1, foods_max_num: 10 }, foods: { 102: 1 } });
    await t.db
      .insertInto('yard_basket')
      .values({ rest_id: ctx.restaurantId, foods_id: 101, num: 25 })
      .execute();
    await expect(t.game.yard.storeBasket(ctx, { foodsId: 101, num: 26 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'basket', id: 101, need: 26, have: 25 },
    });
    const r = await t.game.yard.storeBasket(ctx, { foodsId: 101, num: 25 });
    expect(r.data).toEqual({ stored: 10, dropped: 15 });
    expect(await foodNum(t, ctx.restaurantId, 101)).toEqual({ num: 0, fridge: 10 });
    expect(await basketNum(t, ctx.restaurantId, 101)).toBe(0);
    const logs = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(logs).toContainEqual({ type: 'fridge.drop', params: { foodsId: 101, num: 15 } });
    expect(await t.game.yard.basket(ctx)).toEqual({ items: [] });
  });
});
