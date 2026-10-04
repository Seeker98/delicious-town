import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { counters, insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { activityCacheFor } from './active';
import { myRankOf, poolOf, rankedOf } from './coop';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const award = { coin: 10 };
const spec = (patch: Record<string, unknown> = {}) => ({
  kind: 'coop' as const,
  def: {
    rules: [
      { key: 'market.buy', points: 10, dailyCap: 30 },
      { key: 'shop.buy', points: 1, dailyCap: 100 },
    ],
    milestones: [
      { target: 20, minContribution: 0, award },
      { target: 50, minContribution: 15, award: { coin: 50 } },
    ],
    ranks: [
      { from: 1, to: 1, award: { diamond: 5 } },
      { from: 2, to: 3, award: { diamond: 1 } },
    ],
    ...patch,
  },
});
const act = (ctx: { shardId: number; restaurantId: number }, key: string, n = 1) =>
  runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (o) => emitAction(o, key, n));

describe('全服合力计数和总分（148-3 设计 §4、§5）', () => {
  it('按规则计分、有每天上限；总分只算本区服的店', async () => {
    const s1 = await createShard(t.db);
    const s2 = await createShard(t.db);
    const a = await newRestaurant(t, { shardId: s1 });
    const b = await newRestaurant(t, { shardId: s1 });
    const c = await newRestaurant(t, { shardId: s2 });
    const id = await insertActivity(t, { shardId: s1, spec: spec() });
    await act(a, 'market.buy', 5);
    await act(b, 'shop.buy', 3);
    await act(c, 'market.buy');
    expect(await counters(t, id, a.restaurantId)).toEqual({ points: 30 });
    expect(await counters(t, id, c.restaurantId)).toEqual({});
    expect(await poolOf(t.db, id, s1)).toBe(33);
    expect(await poolOf(t.db, id, s2)).toBe(0);
  });

  it('全服活动每个区服各自求和、各自排名；同分同名次；我的名次', async () => {
    const s1 = await createShard(t.db);
    const s2 = await createShard(t.db);
    const a = await newRestaurant(t, { shardId: s1 });
    const b = await newRestaurant(t, { shardId: s1 });
    const x = await newRestaurant(t, { shardId: s1 });
    const c = await newRestaurant(t, { shardId: s2 });
    const back = t.clock.now;
    t.clock.set(new Date('2096-01-02T00:00:00Z'));
    const id = await insertActivity(t, {
      shardId: null,
      spec: spec(),
      startsAt: new Date('2096-01-01T00:00:00Z'),
      endsAt: new Date('2096-01-10T00:00:00Z'),
    });
    try {
      await act(a, 'market.buy', 2);
      await act(b, 'market.buy', 2);
      await act(x, 'shop.buy', 5);
      await act(c, 'market.buy');
      expect(await poolOf(t.db, id, s1)).toBe(45);
      expect(await poolOf(t.db, id, s2)).toBe(10);
      expect((await rankedOf(t.db, id, s1)).map((r) => [r.restId, r.rank, r.points])).toEqual([
        [a.restaurantId, 1, 20],
        [b.restaurantId, 1, 20],
        [x.restaurantId, 3, 5],
      ]);
      expect((await rankedOf(t.db, id, s1, 1)).map((r) => r.restId)).toEqual([a.restaurantId]);
      expect(await myRankOf(t.db, id, s1, 5)).toBe(3);
      expect(await myRankOf(t.db, id, s1, 20)).toBe(1);
      expect(await myRankOf(t.db, id, s1, 0)).toBeNull();
    } finally {
      t.clock.set(back);
      await t.db.deleteFrom('activity').where('id', '=', id).execute();
      activityCacheFor(t.deps.bus, t.game.deps).invalidate();
    }
  });
});

describe('全服合力领取和列表（148-3 设计 §6、§8.1）', () => {
  it('总分不够不能领；够了能领、领过再领报已领；个人门槛不够不能领', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const c = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await act(a, 'market.buy');
    await expect(t.game.activity.claim(a, id, 's0')).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    await act(b, 'market.buy', 3);
    expect((await t.game.activity.claim(a, id, 's0')).data.keys).toEqual(['s0']);
    await expect(t.game.activity.claim(a, id, 's0')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    await act(a, 'shop.buy', 20);
    await act(c, 'shop.buy', 5);
    await expect(t.game.activity.claim(c, id, 's1')).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
    expect((await t.game.activity.claim(a, id, 's1')).data.keys).toEqual(['s1']);
  });

  it('列表带总分、前 10 名（标出自己）、我的名次、今天各规则得分；别的类型 coop 为 null', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    const goals = await insertActivity(t, {
      shardId,
      spec: { kind: 'goals', def: { goals: [{ key: 'signin', target: 1, award }] } },
    });
    await act(a, 'market.buy', 2);
    await act(b, 'market.buy');
    const items = (await t.game.activity.list(b)).items;
    const x = items.find((i) => i.id === id)!;
    expect(x.coop).toEqual({
      pool: 30,
      top: [
        { rank: 1, restId: a.restaurantId, name: expect.any(String), points: 20, mine: false },
        { rank: 2, restId: b.restaurantId, name: expect.any(String), points: 10, mine: true },
      ],
      myRank: 2,
    });
    expect(x.today).toEqual({ 'market.buy': 10, 'shop.buy': 0 });
    expect(x.rewards.map((r) => r.reached)).toEqual([true, false]);
    expect(items.find((i) => i.id === goals)!.coop).toBeNull();
  });
});

describe('我的名次和缓存的前 10 名一致（backlog 148-3）', () => {
  it('前 10 名还在缓存里时，我的名次按缓存里的写，不会表头第 1、表里第 2', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: spec() });
    await act(a, 'market.buy', 2);
    await act(b, 'market.buy');
    expect((await t.game.activity.list(b)).items.find((i) => i.id === id)!.coop!.myRank).toBe(2);
    await act(b, 'market.buy', 2);
    const coop = (await t.game.activity.list(b)).items.find((i) => i.id === id)!.coop!;
    expect(coop.top.find((r) => r.mine)!.rank).toBe(2);
    expect(coop.myRank).toBe(2);
  });
});

describe('终审 I1：等级不够、没有贡献的店领不到门槛为 0 的里程碑', () => {
  it('列表里不算达成，领取报未达成', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId, patch: { level: 20 } });
    const low = await newRestaurant(t, { shardId, patch: { level: 1 } });
    const id = await insertActivity(t, { shardId, spec: spec(), minLevel: 10 });
    await act(a, 'market.buy', 3);
    await act(low, 'market.buy', 3);
    const x = (await t.game.activity.list(low)).items.find((i) => i.id === id)!;
    expect(x.coop!.pool).toBe(30);
    expect(x.rewards[0]!.reached).toBe(false);
    expect(x.claimable).toBe(0);
    await expect(t.game.activity.claim(low, id, 's0')).rejects.toMatchObject({ code: 'REQUIREMENT_NOT_MET' });
  });
});
