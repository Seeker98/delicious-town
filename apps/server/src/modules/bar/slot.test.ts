import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { createTestGame, foodNum, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';

let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const setFail = (restId: number, fail: number) =>
  t.db.insertInto('bar_state').values({ rest_id: restId, slot_fail: fail }).execute();
const failOf = async (restId: number) =>
  (
    await t.db
      .selectFrom('bar_state')
      .select('slot_fail')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow()
  ).slot_fail;
const newsOf = (restId: number) =>
  t.db.selectFrom('news').select(['type', 'params']).where('rest_id', '=', restId).orderBy('id').execute();

describe('老虎机（设计文档 §3.5）', () => {
  it('抽 2 次：每次 3 格，相同奖项合并发放；扣蟹币；统计累计；最多再抽几次必出；支线「玩一次老虎机」完成', async () => {
    const ctx = await newRestaurant(t, { verified: true, goods: { 240: 5 } });
    rngValues = [0.5, 0.77]; // 每格：不提前保底；抽到十三香
    expect((await t.game.bar.slot(ctx, { times: 2 })).data).toEqual({
      spins: [
        [1, 1, 1],
        [1, 1, 1],
      ],
      rewards: [{ awardId: 1, kind: 'foods', itemId: 326, num: 6 }],
      krabCoins: 3,
      floorLeft: 99,
    });
    expect((await foodNum(t, ctx.restaurantId, 326)).num).toBe(6);
    expect(await goodsNum(t, ctx.restaurantId, 240)).toBe(3);
    expect(await newsOf(ctx.restaurantId)).toEqual([]);
    rngValues = [0.5]; // 空
    expect((await t.game.bar.slot(ctx, { times: 1 })).data).toMatchObject({
      spins: [[0, 0, 0]],
      rewards: [],
    });
    expect((await t.game.bar.overview(ctx)).slot).toMatchObject({
      emailVerified: true,
      floorLeft: 98,
      stats: [
        { awardId: 0, num: 3 },
        { awardId: 1, num: 6 },
      ],
    });
    await showQuest(t, ctx.restaurantId, 3081);
    const side = questIn(await t.game.task.tasks(ctx), 3081)!;
    expect(side).toMatchObject({ key: 'bar.slot', progress: 3, done: true });
  });

  it('一次请求跨过 300 格保底：那一格出蟹黄堡并发新闻，之后从 0 重新计（Review Focus 1）', async () => {
    const ctx = await newRestaurant(t, { verified: true, goods: { 240: 2 } });
    await setFail(ctx.restaurantId, 297);
    rngValues = [0.5];
    expect((await t.game.bar.slot(ctx, { times: 2 })).data).toEqual({
      spins: [
        [0, 0, 0],
        [100, 0, 0],
      ],
      rewards: [{ awardId: 100, kind: 'goods', itemId: 180, num: 1 }],
      krabCoins: 0,
      floorLeft: 100,
    });
    expect(await goodsNum(t, ctx.restaurantId, 180)).toBe(1);
    expect(await failOf(ctx.restaurantId)).toBe(2);
    expect(await newsOf(ctx.restaurantId)).toEqual([
      { type: 'bar.slot', params: { awardId: 100, kind: 'goods', itemId: 180, num: 1 } },
    ]);
  });

  it('提前保底：fail 200 时随机数 0.0005，有神灯（率翻倍到 0.00064）出蟹黄堡，没有神灯（0.00032）不出', async () => {
    const lampy = await newRestaurant(t, { verified: true, goods: { 240: 1, 389: 1 } });
    const plain = await newRestaurant(t, { verified: true, goods: { 240: 1 } });
    for (const c of [lampy, plain]) await setFail(c.restaurantId, 200);
    rngValues = [0.0005];
    expect((await t.game.bar.slot(lampy, { times: 1 })).data.spins).toEqual([[100, 0, 0]]);
    expect((await t.game.bar.slot(plain, { times: 1 })).data.spins).toEqual([[0, 0, 0]]);
    expect(await failOf(plain.restaurantId)).toBe(203);
    expect((await t.game.bar.overview(lampy)).slot.lamp).toBe(true);
  });

  it('奖池标了新闻的奖项（迷迭香）也发新闻，每种一条', async () => {
    const ctx = await newRestaurant(t, { verified: true, goods: { 240: 1 } });
    rngValues = [0.5, 0.9474];
    expect((await t.game.bar.slot(ctx, { times: 1 })).data.rewards).toEqual([
      { awardId: 11, kind: 'foods', itemId: 450, num: 3 },
    ]);
    expect(await newsOf(ctx.restaurantId)).toEqual([
      { type: 'bar.slot', params: { awardId: 11, kind: 'foods', itemId: 450, num: 3 } },
    ]);
  });

  it('抽到食材时橱柜没格子：进冰箱，不报错；蟹币照扣（Review Focus 2）', async () => {
    const ctx = await newRestaurant(t, {
      verified: true,
      goods: { 240: 1 },
      foods: { 101: 1 },
      patch: { cupboard_num: 1 },
    });
    rngValues = [0.5, 0.77];
    await t.game.bar.slot(ctx, { times: 1 });
    expect(await foodNum(t, ctx.restaurantId, 326)).toEqual({ num: 0, fridge: 3 });
    expect(await goodsNum(t, ctx.restaurantId, 240)).toBe(0);
  });

  it('没验证邮箱报 EMAIL_NOT_VERIFIED；蟹币不够报 NOT_ENOUGH goods 240；都不扣', async () => {
    const unverified = await newRestaurant(t, { goods: { 240: 1 } });
    await expect(t.game.bar.slot(unverified, { times: 1 })).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
    expect(await goodsNum(t, unverified.restaurantId, 240)).toBe(1);
    const poor = await newRestaurant(t, { verified: true, goods: { 240: 1 } });
    await expect(t.game.bar.slot(poor, { times: 2 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 240, need: 2, have: 1 },
    });
    expect(await goodsNum(t, poor.restaurantId, 240)).toBe(1);
  });
});
