import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InsertQueryNode, ValuesNode, type KyselyPlugin } from 'kysely';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { activityCacheFor } from './active';
import { SETTLE_MAX_FAILS, settleActivities } from './settle';
import { gid } from '../../../test/items';

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
      { key: 'market.buy', target: 1, award: { coin: 10, goods: [{ id: gid('大扩容卡'), num: 1 }] } },
      { key: 'market.buy', target: 2, award: { coin: 20, goods: [{ id: gid('大扩容卡'), num: 2 }] } },
      { key: 'market.buy', target: 9, award: { coin: 90 } },
    ],
  },
};
const mails = (restId: number) =>
  t.db
    .selectFrom('mail')
    .select(['title', 'items', 'source', 'tpl', 'tpl_params'])
    .where('rest_id', '=', restId)
    .execute();

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
    // 系统邮件存模板键，前端按语言显示（问题记录 272）
    expect(ms[0]).toMatchObject({ tpl: 'activity.unclaimed', tpl_params: { activity: '国庆' } });
    expect(ms[0]!.source).toBe('activity');
    expect(ms[0]!.items).toEqual({ coin: 20, goods: [{ id: gid('大扩容卡'), num: 2 }] });
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
    t.clock.set(new Date('2094-01-02T00:00:00Z'));
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
    expect(rankMail).toMatchObject({ tpl: 'activity.rank', tpl_params: { activity: '合力', rank: 2 } });
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
    // 支线“社交”（问题记录 515）：贡献榜前 10 名各记一次，重跑不重复记
    for (const r of [a, b, c]) expect(await eventCount(t, r.restaurantId, 'activity.top10')).toBe(1);
    expect(await eventCount(t, idle.restaurantId, 'activity.top10')).toBe(0);
    // 新闻也不重复（backlog 148-3：以前只验证了邮件）
    const again = await t.db
      .selectFrom('news')
      .select('id')
      .where('shard_id', '=', shardId)
      .where('type', '=', 'activity.coopRank')
      .execute();
    expect(again).toHaveLength(1);
  });
});

describe('backlog 148-3：全服合力不限区服', () => {
  it('两个区服各自结算、各发一条新闻，名次只在本区服内排', async () => {
    const s1 = await createShard(t.db);
    const s2 = await createShard(t.db);
    const a1 = await newRestaurant(t, { shardId: s1 });
    const a2 = await newRestaurant(t, { shardId: s2 });
    // 全服活动放在远期（各测试文件用不同年份）：测试库是共用的，此刻生效的全服活动会被并行跑的其他测试看到
    const back = t.clock.now;
    t.clock.set(new Date('2097-01-02T00:00:00Z'));
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, {
      shardId: null,
      spec: {
        kind: 'coop',
        def: {
          rules: [{ key: 'shop.buy', points: 10, dailyCap: 1000 }],
          milestones: [{ target: 1_000_000, minContribution: 0, award: { coin: 1 } }],
          ranks: [{ from: 1, to: 1, award: { diamond: 1 } }],
        },
      },
      endsAt: end,
      title: '全服合力两区',
    });
    try {
      await act(a1, 'shop.buy', 2);
      await act(a2, 'shop.buy', 1);
      const after = new Date(end.getTime() + 3 * 60_000);
      await settleActivities(t.game.deps, s1, after, log);
      await settleActivities(t.game.deps, s2, after, log);
      for (const [shardId, restId] of [
        [s1, a1.restaurantId],
        [s2, a2.restaurantId],
      ] as const) {
        const news = await t.db
          .selectFrom('news')
          .select('params')
          .where('shard_id', '=', shardId)
          .where('type', '=', 'activity.coopRank')
          .execute();
        expect(news).toHaveLength(1);
        expect((news[0]!.params as { top: Array<{ rank: number }> }).top).toHaveLength(1);
        const titles = (await mails(restId)).map((m) => m.title);
        expect(titles).toContain('《全服合力两区》贡献榜第 1 名奖励');
      }
    } finally {
      t.clock.set(back);
      await t.db.deleteFrom('activity').where('id', '=', id).execute();
      activityCacheFor(t.deps.bus, t.game.deps).invalidate();
    }
  });
});

describe('backlog 148-3：贡献榜新闻按名次列', () => {
  it('第 1 名 4 家并列时，新闻里 4 家都列出', async () => {
    const shardId = await createShard(t.db);
    const shops = [];
    for (let i = 0; i < 5; i++) shops.push(await newRestaurant(t, { shardId }));
    const end = new Date(t.clock.now.getTime() + H);
    await insertActivity(t, {
      shardId,
      spec: {
        kind: 'coop',
        def: {
          rules: [{ key: 'shop.buy', points: 10, dailyCap: 1000 }],
          milestones: [{ target: 10_000, minContribution: 0, award: { coin: 1 } }],
          ranks: [{ from: 1, to: 1, award: { diamond: 1 } }],
        },
      },
      endsAt: end,
      title: '并列',
    });
    for (const r of shops.slice(0, 4)) await act(r, 'shop.buy', 2);
    await act(shops[4]!, 'shop.buy', 1);
    await settleActivities(t.game.deps, shardId, new Date(end.getTime() + 3 * 60_000), log);
    const news = await t.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', shardId)
      .where('type', '=', 'activity.coopRank')
      .executeTakeFirstOrThrow();
    const top = (news.params as { top: Array<{ rank: number }> }).top;
    expect(top.map((x) => x.rank)).toEqual([1, 1, 1, 1]);
  });
});

/**
 * 模拟"某家店永远处理失败"：给数据库包一层插件，往 mail 表插这家店的邮件时报错。
 * 只用在传给 settleActivities 的 deps 上，不影响别的测试
 */
function failMailFor(restId: number) {
  const plugin: KyselyPlugin = {
    transformQuery(args) {
      const n = args.node;
      if (InsertQueryNode.is(n) && n.into?.table.identifier.name === 'mail') {
        const cols = (n.columns ?? []).map((c) => c.column.name);
        const i = cols.indexOf('rest_id');
        const rows = n.values && ValuesNode.is(n.values) ? n.values.values : [];
        for (const row of rows) {
          const v = row.kind === 'PrimitiveValueListNode' ? row.values[i] : undefined;
          if (v === restId) throw new Error(`test: mail for ${restId} fails`);
        }
      }
      return n;
    },
    transformResult: async (args) => args.result,
  };
  return { ...t.game.deps, db: t.db.withPlugin(plugin) };
}

describe('backlog 148-1：补发出错的店有次数上限', () => {
  it('一家店一直出错：别的店照常补发；出错到上限后放弃这家、写下补发完成记录，之后不再重试', async () => {
    const shardId = await createShard(t.db);
    const bad = await newRestaurant(t, { shardId });
    const good = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec, endsAt: end, title: '上限' });
    await act(bad, 'market.buy', 1);
    await act(good, 'market.buy', 1);
    const deps = failMailFor(bad.restaurantId);
    const after = new Date(end.getTime() + 3 * 60_000);
    const errors: string[] = [];
    const spy = { error: (_o: object, m: string) => void errors.push(m) };

    const first = await settleActivities(deps, shardId, after, spy);
    expect(first).toMatchObject({ mails: 1, failed: 1 });
    expect(await mails(good.restaurantId)).toHaveLength(1);
    const settled = () =>
      t.db.selectFrom('activity_settle').select('activity_id').where('activity_id', '=', id).execute();
    expect(await settled()).toHaveLength(0);

    for (let i = 1; i < SETTLE_MAX_FAILS; i++) await settleActivities(deps, shardId, after, spy);
    expect(await settled()).toHaveLength(1);
    const fail = await t.db
      .selectFrom('activity_settle_fail')
      .select(['fails', 'last_error'])
      .where('activity_id', '=', id)
      .where('rest_id', '=', bad.restaurantId)
      .executeTakeFirstOrThrow();
    expect(fail.fails).toBe(SETTLE_MAX_FAILS);
    expect(fail.last_error).toContain('fails');
    expect(errors.filter((m) => m.includes('gave up'))).toHaveLength(1);
    expect(await mails(good.restaurantId)).toHaveLength(1);
  });

  it('一个活动处理时出错，不影响同区服的其他活动', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    // 定义坏掉的全服合力（没有名次段），按 id 排在前面
    await insertActivity(t, {
      shardId,
      spec: { kind: 'coop', def: { rules: [], milestones: [] } } as never,
      endsAt: end,
      title: '坏活动',
    });
    await insertActivity(t, { shardId, spec, endsAt: end, title: '好活动' });
    await act(r, 'market.buy', 1);
    await settleActivities(t.game.deps, shardId, new Date(end.getTime() + 3 * 60_000), log);
    expect((await mails(r.restaurantId)).map((m) => m.title)).toEqual(['《好活动》未领取奖励']);
  });
});
