import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { rankWeekPeriod } from './rank';

const DAY = '2026-09-30';
const WEEK = '2026-09-28';
const STRONG = { attr_cook: 20, attr_cutting: 20, attr_fire: 20, attr_season: 10 };
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const two = async (a = {}, b = {}): Promise<[RestCtx, RestCtx]> => {
  const x = await newRestaurant(t, { patch: a });
  const y = await newRestaurant(t, { shardId: x.shardId, patch: b });
  return [x, y];
};
const board = async (shardId: number, week = WEEK) =>
  (
    await t.db
      .selectFrom('tower_rank')
      .select(['rank', 'rest_id'])
      .where('shard_id', '=', shardId)
      .where('week', '=', week)
      .orderBy('rank')
      .execute()
  ).map((r) => [r.rank, r.rest_id]);
const occupy = (ctx: RestCtx, rank: number) => t.game.tower.occupy(ctx, { rank });
const challenge = (ctx: RestCtx, rank: number) => t.game.tower.challengeRank(ctx, { rank });

describe('占位（设计文档裁定 14）', () => {
  it('空位谁都能占（包括第 1 名），不花体力；已在榜上只能往前占，原位置让出；被占的报 rank_taken', async () => {
    const [a, b] = await two();
    expect((await occupy(a, 1)).data).toEqual({ rank: 1 });
    await expect(occupy(b, 1)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'rank_taken' },
    });
    await occupy(b, 6);
    await expect(occupy(b, 9)).rejects.toMatchObject({ params: { reason: 'rank_not_better' } });
    await occupy(b, 4);
    expect(await board(a.shardId)).toEqual([
      [1, a.restaurantId],
      [4, b.restaurantId],
    ]);
    expect((await restRow(t, a.restaurantId)).strength).toBe(100);
    const v = await t.game.tower.rank(b);
    expect(v).toMatchObject({
      week: WEEK,
      myRank: 4,
      left: 10,
      spar: 0,
      rankTop: 8,
      rankGap: 3,
      duelStrength: 5,
    });
    expect(v.weekEnd).toBe(gameTime('2026-10-05', 0).toISOString());
    expect(v.slots).toHaveLength(15);
    expect(v.slots[0]).toMatchObject({ rank: 1, restId: a.restaurantId, level: 1 });
    expect(v.slots[1]).toEqual({ rank: 2, restId: null, name: null, level: null });
  });

  it('两个人同时占同一个空位：只有一个成功（Review Focus 1）', async () => {
    const [a, b] = await two();
    const r = await Promise.allSettled([occupy(a, 3), occupy(b, 3)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { params: { reason: 'rank_taken' } },
    });
    expect(await board(a.shardId)).toHaveLength(1);
  });
});

describe('挑战（设计文档 §3.3）', () => {
  it('胜：交换名次，声望 +2，切磋奖励 2 次（等级 4）；计入切磋总次数（Review Focus 5）和活跃"与好友赛厨"', async () => {
    const [a, b] = await two({}, STRONG);
    await occupy(a, 1);
    await occupy(b, 4);
    const r = await challenge(b, 1);
    expect(r.data).toMatchObject({ win: true, renown: 2, rank: 1, test: false });
    expect(r.data.awards).toEqual([
      { kind: 'coin', id: null, num: 1600, lucky: false },
      { kind: 'coin', id: null, num: 1600, lucky: false },
    ]);
    expect(await board(a.shardId)).toEqual([
      [1, b.restaurantId],
      [4, a.restaurantId],
    ]);
    expect(await restRow(t, b.restaurantId)).toMatchObject({ strength: 95, renown: 2, coin: 3200 });
    expect(await t.game.tower.rank(b)).toMatchObject({ myRank: 1, left: 9, spar: 1 });
    const act = await t.game.task.activation(b);
    expect(act.items.find((i) => i.name === '与好友赛厨')!.count).toBe(1);
  });

  it('负：声望 +1，名次不变；没上榜的挑战第 9~15 名，胜了对方下榜', async () => {
    const [a, b] = await two(STRONG, {});
    await occupy(a, 10);
    expect((await challenge(b, 10)).data).toMatchObject({ win: false, renown: 1, rank: null, awards: [] });
    expect(await board(a.shardId)).toEqual([[10, a.restaurantId]]);
    const c = await newRestaurant(t, {
      shardId: a.shardId,
      patch: { attr_cook: 40, attr_cutting: 40, attr_fire: 40, attr_season: 20 },
    });
    expect((await challenge(c, 10)).data).toMatchObject({ win: true, rank: 10 });
    expect(await board(a.shardId)).toEqual([[10, c.restaurantId]]);
  });

  it('规则：前 8 名要在榜上且名次差 ≤ 3；只能往前；空格报 rank_empty；每天 10 次', async () => {
    const [a, b] = await two();
    await occupy(a, 1);
    await expect(challenge(b, 1)).rejects.toMatchObject({ params: { reason: 'rank_gap', need: 4 } });
    await occupy(b, 5);
    await expect(challenge(b, 1)).rejects.toMatchObject({ params: { reason: 'rank_gap', need: 4 } });
    await expect(challenge(b, 2)).rejects.toMatchObject({ params: { reason: 'rank_empty' } });
    await expect(challenge(a, 5)).rejects.toMatchObject({ params: { reason: 'rank_not_better' } });
    await occupy(b, 4);
    await t.db
      .insertInto('daily_counter')
      .values({ rest_id: b.restaurantId, day: DAY, key: 'tower.rankDone', count: 10 })
      .execute();
    await expect(challenge(b, 1)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'rank', max: 10 },
    });
  });
});

describe('周结算（设计文档 §3.3）', () => {
  it('周一 0 点后本周榜是空的；上周只在结算时按名次开礼包，前三名得称号勋章并发新闻（Review Focus 2）', async () => {
    const [a, b] = await two();
    const c = await newRestaurant(t, { shardId: a.shardId });
    await occupy(a, 1);
    await occupy(b, 4);
    await occupy(c, 9);
    t.clock.set(new Date(gameTime('2026-10-05', 0).getTime() + 30_000));
    const v = await t.game.tower.rank(a);
    expect(v).toMatchObject({ week: '2026-10-05', myRank: null });
    expect(v.slots.every((s) => s.restId === null)).toBe(true);
    expect(rankWeekPeriod(new Date(gameTime('2026-10-05', 0).getTime() + 30_000))).toBeNull();
    expect(rankWeekPeriod(gameTime('2026-10-05', 0, 1))).toBe(WEEK);
    const out = await t.game.jobs
      .find((j) => j.name === 'tower-rank-week')!
      .run({
        shardId: a.shardId,
        period: WEEK,
        now: t.clock.now,
        settings: await t.game.shards.settings(a.shardId),
        log: { error: () => undefined },
      });
    expect(out).toEqual({ awarded: 3, failed: 0 });
    expect(await goodsNum(t, a.restaurantId, 199)).toBe(1);
    expect((await restRow(t, a.restaurantId)).renown).toBe(500);
    expect((await restRow(t, b.restaurantId)).renown).toBe(150);
    expect((await restRow(t, c.restaurantId)).renown).toBe(100);
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('shard_id', '=', a.shardId)
      .where('type', '=', 'tower.rank.week')
      .execute();
    expect(news).toHaveLength(1);
    expect(news[0]!.params).toMatchObject({ week: WEEK, top: [{ rank: 1, restId: a.restaurantId }] });
  });

  it('一家店结算失败不影响其他名次；新闻跟着第一家成功的店发；失败记日志（最终审查 Important 1）', async () => {
    const [a, b] = await two();
    const c = await newRestaurant(t, { shardId: a.shardId });
    await occupy(a, 1);
    await occupy(b, 4);
    await occupy(c, 9);
    // 第 1 名的礼包加 500 声望会让 integer 溢出，这家店的结算失败
    await t.db
      .updateTable('restaurant')
      .set({ renown: 2_147_483_600 })
      .where('id', '=', a.restaurantId)
      .execute();
    t.clock.set(gameTime('2026-10-05', 0, 1));
    const errors: unknown[] = [];
    const out = await t.game.jobs
      .find((j) => j.name === 'tower-rank-week')!
      .run({
        shardId: a.shardId,
        period: WEEK,
        now: t.clock.now,
        settings: await t.game.shards.settings(a.shardId),
        log: { error: (obj) => errors.push(obj) },
      });
    expect(out).toEqual({ awarded: 2, failed: 1 });
    expect(errors).toHaveLength(1);
    expect((await restRow(t, b.restaurantId)).renown).toBe(150);
    expect((await restRow(t, c.restaurantId)).renown).toBe(100);
    const news = await t.db
      .selectFrom('news')
      .select('rest_id')
      .where('shard_id', '=', a.shardId)
      .where('type', '=', 'tower.rank.week')
      .execute();
    expect(news).toEqual([{ rest_id: b.restaurantId }]);
  });
});
