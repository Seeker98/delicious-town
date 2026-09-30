import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { awardGoodsPool } from '../award/random';

const config = testConfig();
let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const newsOf = (restId: number) =>
  t.db.selectFrom('news').select(['type', 'params']).where('rest_id', '=', restId).orderBy('id').execute();

describe('猜酒杯（设计文档 §3.3）', () => {
  it('按连胜收礼券 1、2、3、4；胜率 1/(n+1) 随连胜下降；奖励等级 2 + (n−1)；输了下一局回到 1 张', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 10 } });
    rngValues = [0.1, 0.5]; // 猜中；随机奖励类型 = 银币
    expect((await t.game.bar.cup(ctx)).data).toEqual({
      win: true,
      cost: 1,
      times: 1,
      lucky: false,
      award: { kind: 'coin', id: null, num: 200, lucky: false },
    });
    expect((await t.game.bar.cup(ctx)).data).toMatchObject({
      win: true,
      cost: 2,
      times: 2,
      award: { num: 300 },
    });
    expect((await t.game.bar.cup(ctx)).data).toMatchObject({
      win: true,
      cost: 3,
      times: 3,
      award: { num: 400 },
    });
    rngValues = [0.3]; // 第 4 连胜率 0.2
    expect((await t.game.bar.cup(ctx)).data).toEqual({
      win: false,
      cost: 4,
      times: 1,
      lucky: false,
      award: null,
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(0);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(900);
    expect((await t.game.bar.overview(ctx)).cup).toEqual({ result: 'lose', times: 1, nextCost: 1 });
  });

  it('猜错：连错次数累计，每局 1 张', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 2 } });
    rngValues = [0.9];
    await t.game.bar.cup(ctx);
    expect((await t.game.bar.cup(ctx)).data).toEqual({
      win: false,
      cost: 1,
      times: 2,
      lucky: false,
      award: null,
    });
  });

  it('连胜后礼券不够下一局：NOT_ENOUGH，礼券和连胜都不变（Review Focus 3）', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 2 } });
    rngValues = [0.1, 0.5];
    await t.game.bar.cup(ctx);
    await expect(t.game.bar.cup(ctx)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 1, need: 2, have: 1 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(1);
    expect((await t.game.bar.overview(ctx)).cup).toEqual({ result: 'win', times: 1, nextCost: 2 });
  });

  it('幸运：幸运率 0.3 时第 1 连胜率 0.65，随机数 0.6 猜中并标记幸运', async () => {
    const ctx = await newRestaurant(t, { patch: { luck: 300 }, goods: { 1: 1 } });
    rngValues = [0.6, 0.5];
    expect((await t.game.bar.cup(ctx)).data).toMatchObject({ win: true, lucky: true });
  });

  it('连胜 4 发新闻 bar.cup', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 10 } });
    rngValues = [0.1, 0.5];
    for (let i = 0; i < 3; i++) await t.game.bar.cup(ctx);
    expect(await newsOf(ctx.restaurantId)).toEqual([]);
    await t.game.bar.cup(ctx);
    expect(await newsOf(ctx.restaurantId)).toEqual([{ type: 'bar.cup', params: { times: 4, lucky: false } }]);
  });
});

describe('转数字（设计文档 §3.4）', () => {
  it('中奖：扣 8 张；只给物品（奖励等级 10、不出礼券）；必发新闻', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 8 } });
    rngValues = [0.01, 0.9, 0]; // 中奖（胜率 0.04）；不翻倍；取池里第一个
    const pool = awardGoodsPool(config.bundle.goods, 10, 0, true);
    expect((await t.game.bar.num(ctx, { num: 7 })).data).toEqual({
      win: true,
      barNum: 7,
      hint: null,
      times: 1,
      lucky: false,
      award: { kind: 'goods', id: pool[0], num: 1, lucky: false },
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, pool[0]!)).toBe(1);
    const news = await newsOf(ctx.restaurantId);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ type: 'bar.num', params: { lucky: false, award: { id: pool[0] } } });
  });

  it('没中：转到的数字不等于猜的；三档提示；连续没中计次', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 24 } });
    rngValues = [0.5]; // 没中；k = 12 → 14
    expect((await t.game.bar.num(ctx, { num: 13 })).data).toEqual({
      win: false,
      barNum: 14,
      hint: 'close',
      times: 1,
      lucky: false,
      award: null,
    });
    rngValues = [0.6]; // k = 14 → 16
    expect((await t.game.bar.num(ctx, { num: 13 })).data).toMatchObject({
      barNum: 16,
      hint: 'soft',
      times: 2,
    });
    rngValues = [0.99]; // k = 23 → 25
    expect((await t.game.bar.num(ctx, { num: 13 })).data).toMatchObject({
      barNum: 25,
      hint: 'hard',
      times: 3,
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(0);
    expect((await t.game.bar.overview(ctx)).num).toMatchObject({ result: 'lose', times: 3 });
  });

  it('数字超过 numMax 报 VALIDATION_FAILED，不扣礼券', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 8 } });
    await expect(t.game.bar.num(ctx, { num: 26 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'num' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(8);
  });
});

describe('礼券换蟹币（设计文档 §3.6）', () => {
  it('100 张换 1 个；礼券不够报 NOT_ENOUGH、不扣；不计活跃', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 250 } });
    expect((await t.game.bar.exchange(ctx, { num: 2 })).data).toEqual({ krabCoins: 2, tickets: 50 });
    await expect(t.game.bar.exchange(ctx, { num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 1, need: 100, have: 50 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 240)).toBe(2);
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '酒吧娱乐')!.count).toBe(0);
  });
});
