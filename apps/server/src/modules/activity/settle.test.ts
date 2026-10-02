import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { activityCacheFor } from './active';
import { settleActivities } from './settle';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const H = 3_600_000;
const log = { error: () => {} };
const act = (ctx: { shardId: number; restaurantId: number }, key: string, n = 1) =>
  runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (o) => emitAction(o, key, n));
const spec = {
  kind: 'goals' as const,
  def: {
    goals: [
      { key: 'market.buy', target: 1, award: { coin: 10, goods: [{ id: 5, num: 1 }] } },
      { key: 'market.buy', target: 2, award: { coin: 20, goods: [{ id: 5, num: 2 }] } },
      { key: 'market.buy', target: 9, award: { coin: 90 } },
    ],
  },
};
const mails = (restId: number) =>
  t.db.selectFrom('mail').select(['title', 'items', 'source']).where('rest_id', '=', restId).execute();

describe('结束补发（设计 §6）', () => {
  it('只补发达成没领的，合并成一封；结束 2 分钟内不补发；跑两次只一封', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const idle = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec, endsAt: end, title: '国庆' });
    await act(r, 'market.buy', 2);
    await t.game.activity.claim(r, id, 'g0');
    await act(idle, 'shop.buy');

    expect(
      (await settleActivities(t.game.deps, shardId, new Date(end.getTime() + 60_000), log)).activities,
    ).toBe(0);
    const after = new Date(end.getTime() + 3 * 60_000);
    const res = await settleActivities(t.game.deps, shardId, after, log);
    expect(res).toMatchObject({ activities: 1, mails: 1, failed: 0 });
    await settleActivities(t.game.deps, shardId, after, log);
    const ms = await mails(r.restaurantId);
    expect(ms).toHaveLength(1);
    expect(ms[0]!.title).toBe('《国庆》未领取奖励');
    expect(ms[0]!.source).toBe('activity');
    expect(ms[0]!.items).toEqual({ coin: 20, goods: [{ id: 5, num: 2 }] });
    expect(await mails(idle.restaurantId)).toHaveLength(0);
    const claims = await t.db
      .selectFrom('activity_claim')
      .select(['reward_key', 'via'])
      .where('activity_id', '=', id)
      .where('rest_id', '=', r.restaurantId)
      .orderBy('reward_key')
      .execute();
    expect(claims).toEqual([
      { reward_key: 'g0', via: 'page' },
      { reward_key: 'g1', via: 'mail' },
    ]);
  });

  it('全服活动在每个区服各补发一次', async () => {
    const s1 = await createShard(t.db);
    const s2 = await createShard(t.db);
    const a = await newRestaurant(t, { shardId: s1 });
    const b = await newRestaurant(t, { shardId: s2 });
    // 全服活动放在远期（各测试文件用不同年份，避免互相看到）：测试库是共用的，此刻生效的全服活动会被并行跑的其他测试看到
    const back = t.clock.now;
    t.clock.set(new Date('2097-01-02T00:00:00Z'));
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId: null, spec, endsAt: end });
    try {
      await act(a, 'market.buy');
      await act(b, 'market.buy');
      const after = new Date(end.getTime() + 3 * 60_000);
      await settleActivities(t.game.deps, s1, after, log);
      expect(await mails(a.restaurantId)).toHaveLength(1);
      expect(await mails(b.restaurantId)).toHaveLength(0);
      await settleActivities(t.game.deps, s2, after, log);
      expect(await mails(b.restaurantId)).toHaveLength(1);
      const rows = await t.db
        .selectFrom('activity_settle')
        .select('shard_id')
        .where('activity_id', '=', id)
        .execute();
      expect(rows.map((x) => x.shard_id).sort()).toEqual([s1, s2].sort());
    } finally {
      t.clock.set(back);
      await t.db.deleteFrom('activity').where('id', '=', id).execute();
      activityCacheFor(t.deps.bus, t.game.deps).invalidate();
    }
  });

  it('战令：解锁了的店补发进阶档位，没解锁的不发', async () => {
    const shardId = await createShard(t.db);
    const paid = await newRestaurant(t, { shardId, patch: { diamond: 10 } });
    const free = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, {
      shardId,
      endsAt: end,
      spec: {
        kind: 'pass',
        def: {
          rules: [{ key: 'market.buy', points: 10, dailyCap: 100 }],
          levels: [{ points: 10, free: { coin: 1 }, premium: { coin: 100 } }],
          unlock: { diamond: 10 },
        },
      },
    });
    await act(paid, 'market.buy');
    await act(free, 'market.buy');
    await t.game.activity.unlock(paid, id);
    await settleActivities(t.game.deps, shardId, new Date(end.getTime() + 3 * 60_000), log);
    expect((await mails(paid.restaurantId))[0]!.items).toEqual({ coin: 101 });
    expect((await mails(free.restaurantId))[0]!.items).toEqual({ coin: 1 });
  });
});

describe('全服合力结算（148-3 设计 §7）', () => {
  const coop = {
    kind: 'coop' as const,
    def: {
      rules: [{ key: 'market.buy', points: 10, dailyCap: 1000 }],
      milestones: [{ target: 30, minContribution: 20, award: { coin: 7 } }],
      ranks: [
        { from: 1, to: 1, award: { diamond: 3 } },
        { from: 2, to: 2, award: { diamond: 1 } },
      ],
    },
  };
  it('补发里程碑；名次段边界并列都发；积分 0 不发；每区服一条新闻；重跑不重复发邮件', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const c = await newRestaurant(t, { shardId });
    const idle = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec: coop, endsAt: end, title: '合力' });
    await act(a, 'market.buy', 3);
    await act(b, 'market.buy', 2);
    await act(c, 'market.buy', 2);
    await act(idle, 'shop.buy');
    const after = new Date(end.getTime() + 3 * 60_000);
    await settleActivities(t.game.deps, shardId, after, log);
    await settleActivities(t.game.deps, shardId, after, log);
    // 只看本活动的邮件：同文件前面的用例留下的全服目标清单活动也会给这些店补发（同样用 market.buy）
    const own = async (restId: number) => (await mails(restId)).filter((m) => m.title.startsWith('《合力》'));
    const titles = async (restId: number) => (await own(restId)).map((m) => m.title).sort();
    expect(await titles(a.restaurantId)).toEqual(['《合力》未领取奖励', '《合力》贡献榜第 1 名奖励'].sort());
    expect(await titles(b.restaurantId)).toEqual(['《合力》未领取奖励', '《合力》贡献榜第 2 名奖励'].sort());
    expect(await titles(c.restaurantId)).toEqual(['《合力》未领取奖励', '《合力》贡献榜第 2 名奖励'].sort());
    expect(await own(idle.restaurantId)).toHaveLength(0);
    const rankMail = (await own(b.restaurantId)).find((m) => m.title.includes('贡献榜'))!;
    expect(rankMail.items).toEqual({ diamond: 1 });
    const news = await t.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', shardId)
      .where('type', '=', 'activity.coopRank')
      .execute();
    expect(news).toHaveLength(1);
    expect(news[0]!.params).toMatchObject({
      title: '合力',
      top: [
        { rank: 1, points: 30 },
        { rank: 2, points: 20 },
        { rank: 2, points: 20 },
      ],
    });
    // 模拟上一轮有店失败没写结算完成：重跑时已发过的邮件不再发
    await t.db.deleteFrom('activity_settle').where('activity_id', '=', id).execute();
    await settleActivities(t.game.deps, shardId, after, log);
    expect(await own(a.restaurantId)).toHaveLength(2);
    expect(await own(b.restaurantId)).toHaveLength(2);
  });
});
