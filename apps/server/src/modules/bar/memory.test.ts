import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { listNews } from '../news/news';

const DAY = '2026-09-30';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

/** n 种配料的展示时长：n×600 + (n−1)×200 */
const show = (n: number) => n * 600 + (n - 1) * 200;
const player = () => newRestaurant(t, { goods: { 1: 50 } });
const start = (c: RestCtx) => t.game.bar.memoryStart(c);
const answer = (c: RestCtx, a: number[]) => t.game.bar.memoryAnswer(c, { answer: a });

describe('记忆调酒（4C-3 设计文档 §2.2）', () => {
  it('开局扣 1 张，给出 3 种 0~7 的配料；已有局时再开被拒', async () => {
    const a = await player();
    const r = (await start(a)).data;
    expect(r).toMatchObject({ level: 1, flashMs: 600, gapMs: 200, answerMs: 3000 + 3 * 1500 });
    expect(r.seq).toHaveLength(3);
    for (const x of r.seq) expect(x >= 0 && x < 8).toBe(true);
    expect(await goodsNum(t, a.restaurantId, 1)).toBe(49);
    await expect(start(a)).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'bar_round' } });
    expect((await t.game.bar.overview(a)).memory).toMatchObject({
      played: 1,
      round: { level: 1, passed: false },
    });
  });

  it('三关全过：每关发奖，继续不再扣费；全过写新闻、记可疑计数', async () => {
    const a = await player();
    let r = (await start(a)).data;
    for (const [level, len] of [
      [1, 3],
      [2, 5],
      [3, 7],
    ] as const) {
      expect(r.seq).toHaveLength(len);
      t.clock.advance(show(len));
      const ans = (await answer(a, r.seq)).data;
      expect(ans.correct).toBe(true);
      expect(ans.level).toBe(level);
      expect(ans.award).not.toBeNull();
      if (level < 3) {
        expect(ans).toMatchObject({ canNext: true, finished: false });
        r = (await t.game.bar.memoryNext(a)).data;
        expect(r.level).toBe(level + 1);
      } else {
        expect(ans).toMatchObject({ canNext: false, finished: true });
      }
    }
    expect(await goodsNum(t, a.restaurantId, 1)).toBe(49);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['bar.memory'] });
    expect(n).toMatchObject({ restId: a.restaurantId });
    expect(await getDaily(t.db, a.restaurantId, 'bar.memory.perfect', DAY)).toBe(1);
    expect((await t.game.bar.overview(a)).memory.round).toBeNull();
  });

  it('提交太早或太晚都按答错算，本局结束', async () => {
    const a = await player();
    let r = (await start(a)).data;
    t.clock.advance(show(3) - 300 - 1);
    expect((await answer(a, r.seq)).data).toMatchObject({ correct: false, finished: true, award: null });
    expect((await t.game.bar.overview(a)).memory.round).toBeNull();

    r = (await start(a)).data;
    t.clock.advance(show(3) + 3000 + 3 * 1500 + 1);
    expect((await answer(a, r.seq)).data).toMatchObject({ correct: false, finished: true });
  });

  it('答错结束；没答对就继续被拒；收手结束本局', async () => {
    const a = await player();
    let r = (await start(a)).data;
    await expect(t.game.bar.memoryNext(a)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'not_passed' },
    });
    t.clock.advance(show(3));
    const wrong = r.seq.map((x, i) => (i === 0 ? (x + 1) % 8 : x));
    expect((await answer(a, wrong)).data).toMatchObject({ correct: false, finished: true });
    await expect(answer(a, r.seq)).rejects.toMatchObject({ params: { reason: 'no_round' } });

    r = (await start(a)).data;
    t.clock.advance(show(3));
    expect((await answer(a, r.seq)).data.canNext).toBe(true);
    await t.game.bar.memoryStop(a);
    expect((await t.game.bar.overview(a)).memory.round).toBeNull();
  });

  it('每天最多 20 局，第二天重新计', async () => {
    const a = await player();
    await incrementDaily(t.db, a.restaurantId, 'bar.memory', 20, DAY);
    await expect(start(a)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'bar_daily', max: 20 },
    });
    t.clock.set(gameTime('2026-10-01', 12));
    await start(a);
  });

  it('答错时说明原因：太早、太晚、记错（终审 I3）', async () => {
    const a = await player();
    let r = (await start(a)).data;
    t.clock.advance(show(3) - 300 - 1);
    expect((await answer(a, r.seq)).data.reason).toBe('early');
    r = (await start(a)).data;
    t.clock.advance(show(3) + 3000 + 3 * 1500 + 1);
    expect((await answer(a, r.seq)).data.reason).toBe('late');
    r = (await start(a)).data;
    t.clock.advance(show(3));
    expect(
      (
        await answer(
          a,
          r.seq.map((x) => (x + 1) % 8),
        )
      ).data.reason,
    ).toBe('wrong');
    r = (await start(a)).data;
    t.clock.advance(show(3));
    expect((await answer(a, r.seq)).data.reason).toBeNull();
  });

  it('刷新页面后能接着这一局：概览给出配方和剩余作答时间（终审 I2）', async () => {
    const a = await player();
    const r = (await start(a)).data;
    t.clock.advance(1000);
    const v = (await t.game.bar.overview(a)).memory.round!;
    expect(v).toEqual({ level: 1, passed: false, seq: r.seq, leftMs: show(3) + 3000 + 3 * 1500 - 1000 });
  });

  it('三关全过的新闻每家店每天只写一条（终审 I4：脚本刷屏）', async () => {
    const a = newRestaurant(t, { goods: { 1: 50 } });
    const ctx = await a;
    for (let k = 0; k < 2; k++) {
      let r = (await start(ctx)).data;
      for (const len of [3, 5, 7]) {
        t.clock.advance(show(len));
        const ans = (await answer(ctx, r.seq)).data;
        if (ans.canNext) r = (await t.game.bar.memoryNext(ctx)).data;
      }
    }
    expect(await listNews(t.db, ctx.shardId, { limit: 10, only: ['bar.memory'] })).toHaveLength(1);
  });
});
