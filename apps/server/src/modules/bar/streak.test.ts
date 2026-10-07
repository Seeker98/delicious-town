import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

/** 酒吧的连胜、连败排行改成本周、上周最高（问题记录 517）：每局记下这一周达到过的最高 */
let t: TestGame;
let rngValues: number[] = [0.5];
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(rngValues) });
});
afterAll(() => t.close());

const bests = (restId: number) =>
  t.db
    .selectFrom('bar_streak_best')
    .select(['game', 'result', 'week', 'times', 'reached_at'])
    .where('rest_id', '=', restId)
    .orderBy(['game', 'week', 'result'])
    .execute()
    .then((rows) => rows.map((r) => ({ ...r, week: String(r.week) })));

describe('酒吧连胜、连败的本周最高（问题记录 517）', () => {
  it('划拳：赢 3 局再输，本周最高连胜 3、连败 1；平局不算；输了以后最高不变；跨周另记', async () => {
    t.clock.set(gameTime('2026-10-01', 12)); // 周四，本周一 09-28
    const ctx = await newRestaurant(t, { goods: { [GOODS.mysteryTicket]: 20 } });
    const fg = () => t.game.bar.fg(ctx, { hand: 0 });
    rngValues = [0.1, 0.9]; // 胜，奖励发银币
    await fg();
    await fg();
    const third = t.clock.now;
    await fg();
    t.clock.advance(60_000);
    rngValues = [0.9]; // 负
    await fg();
    rngValues = [0.3]; // 平
    await fg();
    rngValues = [0.1, 0.9];
    await fg();
    expect(await bests(ctx.restaurantId)).toEqual([
      { game: 'fg', result: -1, week: '2026-09-28', times: 1, reached_at: expect.any(Date) },
      { game: 'fg', result: 1, week: '2026-09-28', times: 3, reached_at: third },
    ]);
    // 下周一：连胜接着上周的算（第 2 局），记在新的一周
    t.clock.set(gameTime('2026-10-05', 9));
    await fg();
    const rows = await bests(ctx.restaurantId);
    expect(rows.filter((r) => r.week === '2026-10-05')).toEqual([
      { game: 'fg', result: 1, week: '2026-10-05', times: 2, reached_at: t.clock.now },
    ]);
  });

  it('转数字：连中、连不中分开记', async () => {
    t.clock.set(gameTime('2026-10-01', 12));
    const ctx = await newRestaurant(t, { goods: { [GOODS.mysteryTicket]: 100 } });
    rngValues = [0.5, 0]; // 没中
    await t.game.bar.num(ctx, { num: 7 });
    await t.game.bar.num(ctx, { num: 7 });
    rngValues = [0.01, 0.9, 0]; // 中
    await t.game.bar.num(ctx, { num: 7 });
    expect((await bests(ctx.restaurantId)).map((r) => [r.game, r.result, r.times])).toEqual([
      ['num', -1, 2],
      ['num', 1, 1],
    ]);
  });

  it('猜酒杯：收手或通关算赢、猜错算输', async () => {
    t.clock.set(gameTime('2026-10-01', 12));
    const ctx = await newRestaurant(t, { goods: { [GOODS.mysteryTicket]: 100 } });
    rngValues = [0.1, 0.9]; // 猜中；收手发奖的随机数
    await t.game.bar.cupGuess(ctx, { cup: 0, round: null });
    await t.game.bar.cupStop(ctx);
    await t.game.bar.cupGuess(ctx, { cup: 0, round: null });
    await t.game.bar.cupStop(ctx);
    rngValues = [0.9, 0]; // 猜错
    await t.game.bar.cupGuess(ctx, { cup: 0, round: null });
    expect((await bests(ctx.restaurantId)).map((r) => [r.game, r.result, r.times])).toEqual([
      ['cup', -1, 1],
      ['cup', 1, 2],
    ]);
  });
});
