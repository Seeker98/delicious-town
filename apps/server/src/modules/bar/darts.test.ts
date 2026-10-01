import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { listNews } from '../news/news';

const DAY = '2026-09-30';
/**
 * 每次操作用一组随机数：
 * - 开局：老板三镖各取一个（v×100 落在 [0,10) 得 50 … [95,100) 得 0）；
 * - 瞄准：周期 = 900 + ⌊v₁×501⌋，相位 = v₂。
 */
let script: number[][] = [];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(script.shift() ?? [0]) });
});
afterAll(() => t.close());
beforeEach(() => {
  t.clock.set(gameTime(DAY, 12));
  script = [];
});

const player = () => newRestaurant(t, { goods: { 1: 50 } });
const start = (c: RestCtx) => t.game.bar.dartsStart(c);
const aim = (c: RestCtx) => t.game.bar.dartsAim(c);
const shoot = (c: RestCtx, elapsedMs: number) => t.game.bar.dartsThrow(c, { elapsedMs });
/** 周期 900、相位 0.25：经过 0、450、900… 毫秒时正好在靶心 */
const BULL_AIM = [0, 0.25];

/** 瞄准后等 450ms 投出，正中靶心 */
async function bull(c: RestCtx) {
  script.push(BULL_AIM);
  expect((await aim(c)).data).toEqual({ period: 900, phase: 0.25 });
  t.clock.advance(450);
  return (await shoot(c, 450)).data;
}
/** 上报的时间比服务端多 200ms，判无效记 0 分 */
async function miss(c: RestCtx) {
  script.push(BULL_AIM);
  await aim(c);
  t.clock.advance(450);
  return (await shoot(c, 650)).data;
}

describe('飞镖（4C-3 设计文档 §2.3）', () => {
  it('开局扣 2 张，概览里看不到老板分数；已有局时再开被拒', async () => {
    const a = await player();
    script.push([0.99, 0.99, 0.99]);
    expect((await start(a)).data).toEqual({ throws: [], aiming: false });
    expect(await goodsNum(t, a.restaurantId, 1)).toBe(48);
    const v = (await t.game.bar.overview(a)).darts;
    expect(v).toMatchObject({ cost: 2, played: 1, max: 20, round: { throws: [], aiming: false } });
    expect(JSON.stringify(v)).not.toContain('boss');
    await expect(start(a)).rejects.toMatchObject({ code: 'ALREADY_DONE', params: { what: 'bar_round' } });
  });

  it('没开局不能瞄准，没瞄准不能投', async () => {
    const a = await player();
    await expect(aim(a)).rejects.toMatchObject({ code: 'INVALID_STATE', params: { reason: 'no_round' } });
    script.push([0.99]);
    await start(a);
    await expect(shoot(a, 0)).rejects.toMatchObject({ params: { reason: 'no_aim' } });
  });

  it('按时间算落点：正中 50 分；上报时间比服务端晚或早太多都记 0 分', async () => {
    const a = await player();
    script.push([0.99]);
    await start(a);
    expect(await bull(a)).toMatchObject({ x: 0, score: 50, throws: [50], finished: false });
    expect(await miss(a)).toMatchObject({ x: null, score: 0, throws: [50, 0] });
    script.push(BULL_AIM);
    await aim(a);
    t.clock.advance(2500);
    expect((await shoot(a, 500)).data).toMatchObject({ x: null, score: 0, finished: true });
  });

  it('三镖全中、老板全 0：赢，发高等级奖励、写新闻、记可疑计数', async () => {
    const a = await player();
    script.push([0.99]);
    await start(a);
    await bull(a);
    await bull(a);
    const r = await bull(a);
    expect(r).toMatchObject({ finished: true, boss: [0, 0, 0], result: 'win', refund: 0 });
    expect(r.award).not.toBeNull();
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['bar.darts'] });
    expect(n).toMatchObject({ restId: a.restaurantId });
    expect(await getDaily(t.db, a.restaurantId, 'bar.darts.bull', DAY)).toBe(3);
    expect((await t.game.bar.overview(a)).darts.round).toBeNull();
  });

  it('平局退 1 张；输了什么都没有', async () => {
    const a = await player();
    script.push([0.99]);
    await start(a);
    await miss(a);
    await miss(a);
    expect(await miss(a)).toMatchObject({ result: 'draw', boss: [0, 0, 0], refund: 1, award: null });
    expect(await goodsNum(t, a.restaurantId, 1)).toBe(49);

    script.push([0]);
    await start(a);
    await miss(a);
    await miss(a);
    expect(await miss(a)).toMatchObject({ result: 'lose', boss: [50, 50, 50], refund: 0, award: null });
    expect(await goodsNum(t, a.restaurantId, 1)).toBe(47);
  });

  it('每天最多 20 局', async () => {
    const a = await player();
    await incrementDaily(t.db, a.restaurantId, 'bar.darts', 20, DAY);
    await expect(start(a)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'bar_daily', max: 20 },
    });
  });
});
