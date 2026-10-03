import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, roundOf } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { incrementDaily } from '../counter/dailyCounter';
import { listNews } from '../news/news';
import { settleShardRound } from '../settlement/runner';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

/** 直接定下今天的星愿 */
const setBless = (shardId: number, restId: number, blessId: number, day = DAY) =>
  t.db
    .insertInto('town_bless')
    .values({ shard_id: shardId, day, bless_id: blessId, rest_id: restId, created_at: t.clock.now })
    .execute();
/** 把今天的活跃度直接加到至少 points：逐项加满，直到够为止（全部加满共 170 分） */
const giveActivation = async (ctx: RestCtx, points: number) => {
  let sum = 0;
  for (const a of config.bundle.activationTasks.filter((x) => x.limitTimes > 0)) {
    if (sum >= points) break;
    await incrementDaily(t.db, ctx.restaurantId, `act:${a.id}`, a.limitTimes, DAY);
    sum += a.limitTimes * a.points;
  }
};

describe('许愿（设计文档 §3.7）', () => {
  it('持有神灯才能许愿；许到的星愿写新闻，神灯不消耗', async () => {
    const none = await newRestaurant(t);
    await expect(t.game.town.wish(none)).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { id: 389 } });
    const a = await newRestaurant(t, { goods: { 389: 1 } });
    const { bless } = (await t.game.town.wish(a)).data;
    expect(config.bless.get(bless.id)!.name).toBe(bless.name);
    expect(await goodsNum(t, a.restaurantId, 389)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['town.bless'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { blessId: bless.id, blessName: bless.name } });
  });

  it('每区服每天只有第一个许愿的人生效；两人同时许愿只成功一个；第二天可以再许', async () => {
    const a = await newRestaurant(t, { goods: { 389: 1 } });
    const b = await newRestaurant(t, { shardId: a.shardId, goods: { 389: 1 } });
    const both = await Promise.allSettled([t.game.town.wish(a), t.game.town.wish(b)]);
    expect(both.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(both.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { code: 'ALREADY_DONE', params: { what: 'wish' } },
    });
    t.clock.set(gameTime('2026-10-01', 12));
    await t.game.town.wish(b);
  });
});

describe('共飨（设计文档 §3.7、裁定 8~10）', () => {
  it('没人许愿、活跃度不够都不能领；领过一次不能再领', async () => {
    const a = await newRestaurant(t);
    await expect(t.game.town.feast(a, {})).rejects.toMatchObject({ params: { reason: 'no_bless' } });
    await setBless(a.shardId, a.restaurantId, 4);
    await expect(t.game.town.feast(a, {})).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'activation', need: 80, have: 0 },
    });
    await giveActivation(a, 80);
    const before = (await restRow(t, a.restaurantId)).coin;
    expect((await t.game.town.feast(a, {})).data.rewards).toEqual([{ kind: 'coin', id: null, num: 200_000 }]);
    expect((await restRow(t, a.restaurantId)).coin).toBe(before + 200_000);
    await expect(t.game.town.feast(a, {})).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'feast' },
    });
  });

  it('随机食材：区间内不重复的 num 种各 1 个；有神灯多一种', async () => {
    const a = await newRestaurant(t, { goods: { 389: 1 } });
    await setBless(a.shardId, a.restaurantId, 1);
    await giveActivation(a, 60);
    const { rewards } = (await t.game.town.feast(a, {})).data;
    expect(rewards).toHaveLength(4);
    expect(new Set(rewards.map((r) => r.id)).size).toBe(4);
    for (const r of rewards) {
      expect(r).toMatchObject({ kind: 'foods', num: 1 });
      expect([1, 2]).toContain(config.requireFood(r.id!).level);
    }
  });

  it('自选食材：必须选区间里的；给 num 个', async () => {
    const a = await newRestaurant(t);
    await setBless(a.shardId, a.restaurantId, 3);
    await giveActivation(a, 120);
    const lv5 = config.foodsByLevel.get(5)![0]!;
    const lv1 = config.foodsByLevel.get(1)![0]!;
    await expect(t.game.town.feast(a, {})).rejects.toMatchObject({ params: { reason: 'foods_not_allowed' } });
    await expect(t.game.town.feast(a, { foodsId: lv1.id })).rejects.toMatchObject({
      params: { reason: 'foods_not_allowed' },
    });
    expect((await t.game.town.feast(a, { foodsId: lv5.id })).data.rewards).toEqual([
      { kind: 'foods', id: lv5.id, num: 1 },
    ]);
    expect((await foodNum(t, a.restaurantId, lv5.id)).num).toBe(1);
  });

  it('道具、钻石', async () => {
    const a = await newRestaurant(t, { goods: { 389: 1 } });
    await setBless(a.shardId, a.restaurantId, 6);
    await giveActivation(a, 60);
    expect((await t.game.town.feast(a, {})).data.rewards).toEqual([{ kind: 'goods', id: 1, num: 31 }]);
    const b = await newRestaurant(t, { patch: { diamond: 0 } });
    await setBless(b.shardId, b.restaurantId, 5);
    await giveActivation(b, 150);
    expect((await t.game.town.feast(b, {})).data.rewards).toEqual([{ kind: 'diamond', id: null, num: 5 }]);
    expect((await restRow(t, b.restaurantId)).diamond).toBe(5);
  });
});

describe('全镇加成（设计文档 §3.7）', () => {
  it('当天的星愿 buff 进结算的各项汇总率；第二天不再有', async () => {
    const a = await newRestaurant(t, { patch: { coin: 1000, oil: 1000 } });
    await setBless(a.shardId, a.restaurantId, 1);
    const now = gameTime(DAY, 12);
    await settleShardRound(t.game.deps, t.game.world, a.shardId, roundOf(now), now);
    const rows = await t.db
      .selectFrom('income_round')
      .select('rates')
      .where('rest_id', '=', a.restaurantId)
      .execute();
    const rates = rows[0]!.rates as { atRate: { parts: Record<string, number> } };
    expect(rates.atRate.parts.bless).toBe(0.05);

    const next = gameTime('2026-10-01', 12);
    t.clock.set(next);
    await settleShardRound(t.game.deps, t.game.world, a.shardId, roundOf(next), next);
    const rows2 = await t.db
      .selectFrom('income_round')
      .select('rates')
      .where('rest_id', '=', a.restaurantId)
      .orderBy('id', 'desc')
      .execute();
    expect(
      (rows2[0]!.rates as { atRate: { parts: Record<string, number> } }).atRate.parts.bless,
    ).toBeUndefined();
  });

  it('首页"生效的加成"最前面是今日星愿，到当天结束', async () => {
    const a = await newRestaurant(t);
    await setBless(a.shardId, a.restaurantId, 4);
    const o = await t.game.restaurant.overview(a.restaurantId);
    expect(o.effects[0]).toEqual({
      sourceType: 'bless',
      sourceId: 4,
      name: '招财进宝',
      effects: { coinRate: 0.08 },
      expiresAt: gameTime('2026-10-01', 0).toISOString(),
    });
  });
});
