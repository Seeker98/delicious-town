import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';

let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const newsOf = (restId: number) =>
  t.db.selectFrom('news').select(['type', 'params']).where('rest_id', '=', restId).orderBy('id').execute();

describe('划拳（设计文档 §3.2）', () => {
  it('胜：扣 1 张礼券；对方出 (h+1)%3；奖励等级 2 → 银币 200；连胜跨请求累计，第 3 连奖励等级 3', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 10 } });
    rngValues = [0.1, 0.5]; // 胜；随机奖励类型 = 银币
    expect((await t.game.bar.fg(ctx, { hand: 0 })).data).toEqual({
      result: 'win',
      barHand: 1,
      times: 1,
      lucky: false,
      coin: 0,
      award: { kind: 'coin', id: null, num: 200, lucky: false },
    });
    await t.game.bar.fg(ctx, { hand: 2 });
    expect((await t.game.bar.fg(ctx, { hand: 1 })).data).toMatchObject({
      result: 'win',
      barHand: 2,
      times: 3,
      award: { kind: 'coin', num: 300 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(7);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(700);
  });

  it('平：银币 = 餐厅等级 × 10 + 幸运总值，对方出同样的拳；负：对方出克制的拳；结果变了从 1 开始计', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 3 }, goods: { 1: 5 } });
    rngValues = [0.3];
    expect((await t.game.bar.fg(ctx, { hand: 2 })).data).toEqual({
      result: 'draw',
      barHand: 2,
      times: 1,
      lucky: false,
      coin: 30,
      award: null,
    });
    expect((await t.game.bar.fg(ctx, { hand: 2 })).data).toMatchObject({ result: 'draw', times: 2 });
    rngValues = [0.9];
    expect((await t.game.bar.fg(ctx, { hand: 0 })).data).toEqual({
      result: 'lose',
      barHand: 2,
      times: 1,
      lucky: false,
      coin: 0,
      award: null,
    });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(60);
  });

  it('连胜中间出一次平局：连胜断掉，下一次胜是 1 连胜、奖励等级回到 2（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 5 } });
    rngValues = [0.1, 0.5];
    await t.game.bar.fg(ctx, { hand: 0 });
    await t.game.bar.fg(ctx, { hand: 0 });
    rngValues = [0.3];
    await t.game.bar.fg(ctx, { hand: 0 });
    expect((await t.game.bar.overview(ctx)).fg).toEqual({ result: 'draw', times: 1 });
    rngValues = [0.1, 0.5];
    expect((await t.game.bar.fg(ctx, { hand: 0 })).data).toMatchObject({
      result: 'win',
      times: 1,
      award: { kind: 'coin', num: 200 },
    });
  });

  it('幸运：幸运 300（幸运率 0.3）时 0.4 也胜，标记幸运；银币按幸运总值算', async () => {
    const ctx = await newRestaurant(t, { patch: { luck: 300 }, goods: { 1: 1 } });
    rngValues = [0.4, 0.5];
    expect((await t.game.bar.fg(ctx, { hand: 0 })).data).toMatchObject({
      result: 'win',
      lucky: true,
      award: { kind: 'coin', num: 1400 },
    });
  });

  it('连胜 5 发新闻 bar.fg', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 5 } });
    rngValues = [0.1, 0.5];
    for (let i = 0; i < 4; i++) await t.game.bar.fg(ctx, { hand: 0 });
    expect(await newsOf(ctx.restaurantId)).toEqual([]);
    await t.game.bar.fg(ctx, { hand: 0 });
    const news = await newsOf(ctx.restaurantId);
    expect(news.map((n) => n.type)).toEqual(['bar.fg']);
    expect(news[0]!.params).toMatchObject({ times: 5, lucky: false, award: { kind: 'coin' } });
  });

  it('礼券不够报 NOT_ENOUGH goods 1，什么都不变', async () => {
    const ctx = await newRestaurant(t);
    await expect(t.game.bar.fg(ctx, { hand: 0 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 1, need: 1 },
    });
    expect(
      await t.db.selectFrom('bar_state').selectAll().where('rest_id', '=', ctx.restaurantId).execute(),
    ).toEqual([]);
  });

  it('计活跃"酒吧娱乐"；主线「去酒吧玩一次」玩一次划拳就完成', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 5 }, goods: { 1: 1 } });
    await showQuest(t, ctx.restaurantId, 2064);
    expect(questIn(await t.game.task.tasks(ctx), 2064)).toMatchObject({ key: 'bar.play', done: false });
    rngValues = [0.9];
    await t.game.bar.fg(ctx, { hand: 0 });
    expect(questIn(await t.game.task.tasks(ctx), 2064)).toMatchObject({ progress: 1, done: true });
    const act = await t.game.task.activation(ctx);
    expect(act.items.find((i) => i.name === '酒吧娱乐')!.count).toBe(1);
  });
});

describe('酒吧概览', () => {
  it('礼券、蟹币、三个游戏的上一局、猜酒杯下一局花费、老虎机保底和奖池', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 3, 240: 2 } });
    const v = await t.game.bar.overview(ctx);
    expect(v).toMatchObject({
      tickets: 3,
      krabCoins: 2,
      fg: { result: null, times: 0 },
      cup: { result: null, times: 0, nextCost: 1 },
      num: { result: null, times: 0, cost: 8, max: 25 },
      slot: { emailVerified: false, lamp: false, floorLeft: 101, stats: [] },
      krabCoinTickets: 100,
    });
    expect(v.slot.pool).toHaveLength(22);
    expect(v.slot.pool.find((a) => a.id === 100)).toEqual({
      id: 100,
      kind: 'goods',
      itemId: 180,
      rate: 12 / 19553,
      rare: true,
    });
    rngValues = [0.1, 0.5];
    await t.game.bar.fg(ctx, { hand: 0 });
    expect((await t.game.bar.overview(ctx)).fg).toEqual({ result: 'win', times: 1 });
  });

  it('区服关闭 bar：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { bar: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.bar.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.bar.fg(ctx, { hand: 0 })).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
