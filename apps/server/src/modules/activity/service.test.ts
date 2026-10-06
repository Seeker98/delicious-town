import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { insertActivity } from '../../../test/activity';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { queryCounter } from '../../../test/queries';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const H = 3_600_000;
const svc = () => t.game.activity;
const act = (ctx: { shardId: number; restaurantId: number }, key: string, n = 1) =>
  runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (o) => emitAction(o, key, n));
const goals = {
  kind: 'goals' as const,
  def: {
    goals: [
      { key: 'market.buy', target: 1, award: { coin: 10 } },
      { key: 'market.buy', target: 3, award: { coin: 30 } },
    ],
  },
};

describe('玩家接口（设计 §5.1）', () => {
  it('列表带进度和奖励状态；领奖到账；重复领 ALREADY_DONE；没达成 REQUIREMENT_NOT_MET', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const id = await insertActivity(t, { shardId, spec: goals });
    await act(r, 'market.buy');
    const a = (await svc().list(r)).items.find((x) => x.id === id)!;
    expect(a.state).toBe('running');
    expect(a.counters).toEqual({ 'market.buy': 1 });
    expect(a.rewards.map((x) => [x.key, x.reached, x.claimed])).toEqual([
      ['g0', true, null],
      ['g1', false, null],
    ]);
    expect(a.claimable).toBe(1);
    expect(await svc().summary(r)).toEqual({ running: 1, claimable: 1 });
    await svc().claim(r, id, 'g0');
    expect((await restRow(t, r.restaurantId)).coin).toBe(10);
    await expect(svc().claim(r, id, 'g0')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    await expect(svc().claim(r, id, 'g1')).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await expect(svc().claim(r, id, 'zz')).rejects.toMatchObject({ params: { reason: 'no_reward' } });
    const after = (await svc().list(r)).items.find((x) => x.id === id)!;
    expect(after.rewards[0]!.claimed).toBe('page');
  });

  it('全部领取一次领完；没有可领时报 nothing', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const id = await insertActivity(t, { shardId, spec: goals });
    await act(r, 'market.buy', 3);
    const res = await svc().claimAll(r, id);
    expect(res.data.keys).toEqual(['g0', 'g1']);
    expect((await restRow(t, r.restaurantId)).coin).toBe(40);
    await expect(svc().claimAll(r, id)).rejects.toMatchObject({ params: { reason: 'nothing' } });
  });

  it('结束时刻起不能领、不能解锁，状态是 settling；别的区服的活动 NOT_FOUND', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const end = new Date(t.clock.now.getTime() + H);
    const id = await insertActivity(t, { shardId, spec: goals, endsAt: end });
    await act(r, 'market.buy');
    const back = t.clock.now;
    t.clock.set(end);
    await expect(svc().claim(r, id, 'g0')).rejects.toMatchObject({ params: { reason: 'not_running' } });
    expect((await svc().list(r)).items.find((x) => x.id === id)!.state).toBe('settling');
    t.clock.set(back);
    const other = await insertActivity(t, { shardId: await createShard(t.db), spec: goals });
    await expect(svc().claim(r, other, 'g0')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('战令解锁：扣钻石和道具；不够 NOT_ENOUGH；重复 ALREADY_DONE；解锁后之前的进阶档位可领；非战令 not_pass', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, {
      shardId,
      patch: { diamond: 100, coin: 0 },
      goods: { [gid('大扩容卡')]: 2 },
    });
    const poor = await newRestaurant(t, { shardId, patch: { diamond: 10 } });
    const id = await insertActivity(t, {
      shardId,
      spec: {
        kind: 'pass',
        def: {
          rules: [{ key: 'market.buy', points: 10, dailyCap: 100 }],
          levels: [{ points: 10, free: { coin: 1 }, premium: { coin: 100 } }],
          unlock: { diamond: 50, goods: [{ id: gid('大扩容卡'), num: 1 }] },
        },
      },
    });
    await act(r, 'market.buy');
    await expect(svc().claim(r, id, 'p0')).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await expect(svc().unlock(poor, id)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    await svc().unlock(r, id);
    const row = await restRow(t, r.restaurantId);
    expect(row.diamond).toBe(50);
    expect(await goodsNum(t, r.restaurantId, gid('大扩容卡'))).toBe(1);
    await expect(svc().unlock(r, id)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    await svc().claim(r, id, 'p0');
    expect((await restRow(t, r.restaurantId)).coin).toBe(100);
    const today = (await svc().list(r)).items.find((x) => x.id === id)!;
    expect(today.premium).toBe(true);
    expect(today.today).toEqual({ 'market.buy': 10 });
    const g = await insertActivity(t, { shardId, spec: goals });
    await expect(svc().unlock(r, g)).rejects.toMatchObject({ params: { reason: 'not_pass' } });
  });

  it('领奖写个人日志 activity.claim，带活动标题', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: goals, title: '国庆活动' });
    await act(r, 'market.buy');
    await svc().claim(r, id, 'g0');
    const log = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', r.restaurantId)
      .where('type', '=', 'activity.claim')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ title: '国庆活动' });
  });

  it('功能关掉时列表报 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { activity: false } }) })
      .execute();
    await expect(svc().list(r)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});

describe('任务计数（问题记录 318）', () => {
  it('领一次（不管领几个奖励）计一次 activity.claim；活跃"领取限时活动奖励"计入', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: goals });
    await act(r, 'market.buy', 3);
    await svc().claimAll(r, id);
    expect(await eventCount(t, r.restaurantId, 'activity.claim')).toBe(1);
    expect((await t.game.task.activation(r)).items.find((i) => i.name === '领取限时活动奖励')!.count).toBe(1);
  });
});

describe('查询条数（质量期 ③）', () => {
  const q = queryCounter();
  let qt: TestGame;
  beforeAll(async () => {
    qt = await createTestGame({ db: q.db });
  });
  afterAll(async () => {
    await qt.close();
    await q.db.destroy();
  });
  const pass = {
    kind: 'pass' as const,
    def: {
      rules: [{ key: 'market.buy', points: 10, dailyCap: 100 }],
      levels: [{ points: 10, free: { coin: 1 }, premium: { coin: 100 } }],
      unlock: { diamond: 50 },
    },
  };
  const exchange = {
    kind: 'exchange' as const,
    def: {
      currencies: [{ name: '福' }],
      drops: [{ key: 'market.buy', chance: 0.5, currency: 0, num: 1, dailyCap: 5 }],
      shop: [{ cost: [{ currency: 0, num: 2 }], award: { coin: 1 }, limit: 3 }],
      graceHours: 24,
    },
  };

  // 全服合力（backlog 质量期第 ③ 批审查：原来没放进这条）：总分和前 10 名有 30 秒进程内缓存，缓存热的时候不加条数
  const coop = {
    kind: 'coop' as const,
    def: {
      rules: [{ key: 'market.buy', points: 10, dailyCap: 30 }],
      milestones: [{ target: 20, minContribution: 0, award: { coin: 10 } }],
      ranks: [{ from: 1, to: 1, award: { diamond: 5 } }],
    },
  };

  it('活动列表、红点的查询条数不随活动个数增长：4 个和 8 个一样多（含全服合力）', async () => {
    const one = await createShard(qt.db);
    const six = await createShard(qt.db);
    for (const spec of [goals, pass, exchange, coop]) await insertActivity(qt, { shardId: one, spec });
    for (const spec of [goals, pass, exchange, coop, goals, pass, exchange, coop])
      await insertActivity(qt, { shardId: six, spec });
    const r1 = await newRestaurant(qt, { shardId: one });
    const r6 = await newRestaurant(qt, { shardId: six });
    const svc = qt.game.activity;
    // 先各跑一次：区服设置、活动缓存这类进程内缓存先填上
    await svc.list(r1);
    await svc.list(r6);
    const l1 = await q.count(() => svc.list(r1));
    const l6 = await q.count(() => svc.list(r6));
    expect(l6.result.items).toHaveLength(8);
    expect(l6.n).toBe(l1.n);
    expect(l6.n).toBeLessThanOrEqual(8);
    const s6 = await q.count(() => svc.summary(r6));
    expect(s6.n).toBeLessThanOrEqual(l6.n);
  });
});
