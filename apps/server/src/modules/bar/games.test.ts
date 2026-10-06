import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { awardGoodsPool } from '../award/random';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

const config = testConfig();
let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const newsOf = (restId: number) =>
  t.db.selectFrom('news').select(['type', 'params']).where('rest_id', '=', restId).orderBy('id').execute();

describe('转数字（设计文档 §3.4）', () => {
  it('中奖：扣 8 张；只给物品（奖励等级 10、不出礼券）；必发新闻', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.mysteryTicket]: 8 } });
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
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mysteryTicket)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, pool[0]!)).toBe(1);
    const news = await newsOf(ctx.restaurantId);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ type: 'bar.num', params: { lucky: false, award: { id: pool[0] } } });
  });

  it('没中：转到的数字不等于猜的；三档提示；连续没中计次', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.mysteryTicket]: 24 } });
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
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mysteryTicket)).toBe(0);
    expect((await t.game.bar.overview(ctx)).num).toMatchObject({ result: 'lose', times: 3 });
  });

  it('数字超过 numMax 报 VALIDATION_FAILED，不扣礼券', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.mysteryTicket]: 8 } });
    await expect(t.game.bar.num(ctx, { num: 26 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'num' },
    });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mysteryTicket)).toBe(8);
  });
});

describe('礼券换蟹币（设计文档 §3.6）', () => {
  it('100 张换 1 个；礼券不够报 NOT_ENOUGH、不扣；不计活跃', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.mysteryTicket]: 250 } });
    expect((await t.game.bar.exchange(ctx, { num: 2 })).data).toEqual({ krabCoins: 2, tickets: 50 });
    await expect(t.game.bar.exchange(ctx, { num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: GOODS.mysteryTicket, need: 100, have: 50 },
    });
    expect(await goodsNum(t, ctx.restaurantId, gid('蟹币'))).toBe(2);
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '酒吧娱乐')!.count).toBe(0);
  });
});
