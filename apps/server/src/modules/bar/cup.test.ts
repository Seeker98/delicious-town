import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { listNews } from '../news/news';
import type { CupState } from './cup';

const DAY = '2026-09-30';
let script: number[] = [];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(script.length > 0 ? script.splice(0) : [0]) });
});
afterAll(() => t.close());
beforeEach(() => {
  t.clock.set(gameTime(DAY, 12));
  t.game.rank.clearCache();
  script = [];
});

const player = (tickets = 10, patch: Record<string, unknown> = {}) =>
  newRestaurant(t, { patch, goods: { [GOODS.mysteryTicket]: tickets } });
const bar = () => t.game.bar;
/** round：前端看到的这一轮（没有局时为 null） */
const guess = (c: RestCtx, cup: number, round: number | null = null) => bar().cupGuess(c, { cup, round });
const stop = (c: RestCtx) => bar().cupStop(c);
const next = (c: RestCtx) => bar().cupNext(c);
const tickets = (c: RestCtx) => goodsNum(t, c.restaurantId, GOODS.mysteryTicket);
const setRound = (c: RestCtx, s: CupState) =>
  t.db
    .insertInto('bar_round')
    .values({
      rest_id: c.restaurantId,
      game: 'cup',
      state: JSON.stringify(s),
      started_at: t.clock.now,
      updated_at: t.clock.now,
    })
    .onConflict((oc) => oc.columns(['rest_id', 'game']).doUpdateSet({ state: JSON.stringify(s) }))
    .execute();
const won = (round: number): CupState => ({
  round,
  won: true,
  last: { pick: 0, ball: 0, win: true, lucky: false },
});
const hasRound = async (c: RestCtx) =>
  (await t.db
    .selectFrom('bar_round')
    .select('rest_id')
    .where('rest_id', '=', c.restaurantId)
    .where('game', '=', 'cup')
    .executeTakeFirst()) !== undefined;
const newsOf = async (c: RestCtx) =>
  (await listNews(t.db, c.shardId, { limit: 50 }))
    .filter((n) => n.restId === c.restaurantId)
    .map((n) => ({ type: n.type, params: n.params }));

describe('猜酒杯：开局和猜（问题记录 427-5）', () => {
  it('没有局时猜就开局：扣 1 张；猜中时骰子就在选的杯子里，等玩家选；概览里能接着玩', async () => {
    const a = await player(1);
    script = [0.1];
    const r = (await guess(a, 1)).data;
    const view = {
      round: 0,
      cups: 2,
      won: true,
      last: { pick: 1, ball: 1, win: true, lucky: false },
      result: null,
      awards: [],
    };
    expect(r).toEqual(view);
    expect(await tickets(a)).toBe(0);
    const o = (await bar().overview(a)).cup;
    expect(o).toMatchObject({ result: null, times: 0, cost: 1, cups: [2, 3, 5, 7], round: view });
    expect(o.tiers).toEqual([
      { awards: 1, news: null },
      { awards: 2, news: null },
      { awards: 4, news: 'news' },
      { awards: 8, news: 'broadcast' },
    ]);
  });

  it('开局计活跃“酒吧娱乐”；接着这一局猜不扣礼券、不再计', async () => {
    const a = await player(5);
    await guess(a, 0);
    await next(a);
    await guess(a, 2, 1);
    expect(await tickets(a)).toBe(4);
    const act = await t.game.task.activation(a);
    expect(act.items.find((i) => i.name === '酒吧娱乐')!.count).toBe(1);
  });

  it('礼券不够：NOT_ENOUGH，不建局', async () => {
    const a = await player(0);
    await expect(guess(a, 0)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await hasRound(a)).toBe(false);
    const act = await t.game.task.activation(a);
    expect(act.items.find((i) => i.name === '酒吧娱乐')!.count).toBe(0);
  });

  it('猜错：骰子在别的杯子里；本局结束，什么都没有，连败 +1', async () => {
    const a = await player();
    script = [0.9, 0.5]; // 没猜中；2 个杯子里除了选的只剩 1 个
    expect((await guess(a, 0)).data).toEqual({
      round: 0,
      cups: 2,
      won: false,
      last: { pick: 0, ball: 1, win: false, lucky: false },
      result: 'lose',
      awards: [],
    });
    expect(await hasRound(a)).toBe(false);
    expect((await bar().overview(a)).cup).toMatchObject({ result: 'lose', times: 1, round: null });
    // 第 3 轮 5 个杯子选 2 号：rng.int(4) = 2 跳过 2 号，骰子在 3 号
    await setRound(a, { round: 2, won: false, last: null });
    script = [0.9, 0.5];
    expect((await guess(a, 2, 2)).data.last).toEqual({ pick: 2, ball: 3, win: false, lucky: false });
    expect((await bar().overview(a)).cup).toMatchObject({ result: 'lose', times: 2 });
  });

  it('杯子编号按这一轮的杯子数查：越界被拒，不扣礼券、不建局', async () => {
    const a = await player(1);
    await expect(guess(a, 2)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', params: { reason: 'cup' } });
    expect(await tickets(a)).toBe(1);
    expect(await hasRound(a)).toBe(false);
    await setRound(a, { round: 2, won: false, last: null });
    await expect(guess(a, 5, 2)).rejects.toMatchObject({ params: { reason: 'cup' } });
    expect((await guess(a, 4, 2)).data).toMatchObject({ round: 2, cups: 5, won: true });
  });

  it('前端看到的轮次和服务端对不上（概览晚到）：cup_round，不扣礼券、不猜（终审 1）', async () => {
    const a = await player(3);
    await setRound(a, { round: 1, won: false, last: null });
    await expect(guess(a, 0)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'cup_round' },
    });
    await expect(guess(a, 0, 2)).rejects.toMatchObject({ params: { reason: 'cup_round' } });
    expect(await tickets(a)).toBe(3);
    expect((await bar().overview(a)).cup.round).toMatchObject({ round: 1, won: false, last: null });
    const b = await player(3);
    await expect(guess(b, 0, 1)).rejects.toMatchObject({ params: { reason: 'cup_round' } });
    expect(await tickets(b)).toBe(3);
    expect(await hasRound(b)).toBe(false);
  });

  it('猜中后没选收手或继续就再猜：cup_decide', async () => {
    const a = await player();
    await setRound(a, won(1));
    await expect(guess(a, 0, 1)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'cup_decide' },
    });
  });

  it('幸运率 0.3：2 个杯子猜中率 0.65，随机数 0.6 猜中并标记幸运', async () => {
    const a = await player(1, { luck: 300 });
    script = [0.6];
    expect((await guess(a, 0)).data.last).toEqual({ pick: 0, ball: 0, win: true, lucky: true });
  });
});

describe('猜酒杯：区服数值把轮数改少了', () => {
  it('超出的旧局在概览里不显示；收手报 no_round，猜就开新局', async () => {
    const a = await player();
    await setRound(a, won(2));
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: a.shardId,
        override: JSON.stringify({
          tuning: {
            bar: {
              cup: {
                cups: [2, 3],
                tiers: [
                  { awards: 1, level: 2, news: null },
                  { awards: 2, level: 4, news: null },
                ],
              },
            },
          },
        }),
      })
      .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override: JSON.stringify({}) }))
      .execute();
    t.game.shards.invalidate(a.shardId);
    try {
      expect((await bar().overview(a)).cup.round).toBeNull();
      await expect(stop(a)).rejects.toMatchObject({ params: { reason: 'no_round' } });
      expect((await guess(a, 0)).data).toMatchObject({ round: 0, cups: 2 });
      expect(await tickets(a)).toBe(9);
      // 已在新的最后一轮猜中的局（改数值前猜中的）：继续就按通关发最后一档（终审 2）
      await setRound(a, won(1));
      const r = (await next(a)).data;
      expect(r).toMatchObject({ round: 1, cups: 3, result: 'clear' });
      expect(r.awards).toHaveLength(2);
      expect(await hasRound(a)).toBe(false);
    } finally {
      await t.db.deleteFrom('shard_config').where('shard_id', '=', a.shardId).execute();
      t.game.shards.invalidate(a.shardId);
    }
  });
});

describe('猜酒杯：收手、继续、通关', () => {
  it('收手：发这一档的份数，局面删掉，连胜 +1', async () => {
    const a = await player();
    await setRound(a, won(1));
    script = [0.9]; // 奖励类型都是银币
    const r = (await stop(a)).data;
    expect(r).toMatchObject({ round: 1, cups: 3, result: 'stop', won: false });
    expect(r.awards).toHaveLength(2);
    expect(r.awards.every((x) => x.kind === 'coin')).toBe(true);
    expect(await hasRound(a)).toBe(false);
    expect((await bar().overview(a)).cup).toMatchObject({ result: 'win', times: 1, round: null });
  });

  it('收手的奖励等级按档：第 2 轮（等级 4）的银币是第 1 轮（等级 2）的两倍', async () => {
    const a = await player();
    await setRound(a, won(0));
    script = [0.9];
    const low = (await stop(a)).data.awards[0]!;
    await setRound(a, won(1));
    script = [0.9];
    const high = (await stop(a)).data.awards[0]!;
    expect(low.kind).toBe('coin');
    expect(high.num).toBe(low.num * 2);
  });

  it('继续：进下一轮，杯子变多，上一档作废', async () => {
    const a = await player();
    await setRound(a, won(0));
    expect((await next(a)).data).toEqual({
      round: 1,
      cups: 3,
      won: false,
      last: null,
      result: null,
      awards: [],
    });
    expect((await bar().overview(a)).cup.round).toMatchObject({ round: 1, cups: 3, won: false });
  });

  it('没猜中就收手、继续：cup_not_won；没有局：no_round', async () => {
    const a = await player();
    await setRound(a, { round: 1, won: false, last: null });
    await expect(stop(a)).rejects.toMatchObject({ params: { reason: 'cup_not_won' } });
    await expect(next(a)).rejects.toMatchObject({ params: { reason: 'cup_not_won' } });
    const b = await player();
    await expect(stop(b)).rejects.toMatchObject({ params: { reason: 'no_round' } });
    await expect(next(b)).rejects.toMatchObject({ params: { reason: 'no_round' } });
  });

  it('第 4 轮猜中就是通关：直接发 8 份，写全服广播', async () => {
    const a = await player();
    await setRound(a, { round: 3, won: false, last: null });
    const r = (await guess(a, 6, 3)).data;
    expect(r).toMatchObject({ round: 3, cups: 7, result: 'clear', last: { pick: 6, ball: 6, win: true } });
    expect(r.awards).toHaveLength(8);
    expect(await hasRound(a)).toBe(false);
    expect(await newsOf(a)).toEqual([{ type: 'bar.cup.big', params: { round: 4, cups: 7 } }]);
  });

  it('第 3 轮收手每次都写新闻、四轮全过每次都发广播，不限条数（用户 2026-10-07 定）', async () => {
    const a = await player();
    await setRound(a, won(2));
    await stop(a);
    await setRound(a, { round: 3, won: false, last: null });
    await guess(a, 0, 3);
    await setRound(a, won(2));
    await stop(a);
    await setRound(a, won(1));
    await stop(a);
    expect(await newsOf(a)).toEqual([
      { type: 'bar.cup', params: { round: 3, cups: 5 } },
      { type: 'bar.cup.big', params: { round: 4, cups: 7 } },
      { type: 'bar.cup', params: { round: 3, cups: 5 } },
    ]);
  });

  it('连胜、连败按局累计；排行“猜酒杯连胜本周”读得到，输了也还在（问题记录 517）', async () => {
    const a = await player();
    await setRound(a, won(0));
    await stop(a);
    await setRound(a, won(0));
    await stop(a);
    expect((await bar().overview(a)).cup).toMatchObject({ result: 'win', times: 2 });
    const best = async () =>
      (await t.game.rank.board(a, 'bar.cup.win.thisWeek')).rows.find((x) => x.restId === a.restaurantId)
        ?.value;
    expect(await best()).toBe(2);
    script = [0.9, 0];
    await guess(a, 0);
    expect((await bar().overview(a)).cup).toMatchObject({ result: 'lose', times: 1 });
    t.game.rank.clearCache();
    expect(await best()).toBe(2);
  });
});
