import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emitAction } from '../../core/action';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { counters, insertActivity } from '../../../test/activity';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const H = 3_600_000;
const award = { coin: 1 };
const goals = (key = 'market.buy') => ({
  kind: 'goals' as const,
  def: { goals: [{ key, target: 5, award }] },
});
const act = (ctx: { shardId: number; restaurantId: number }, key: string, n = 1) =>
  runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (o) => emitAction(o, key, n));

describe('活动计数（设计 §4.2）', () => {
  it('只计窗口内：等于开始时刻计，等于结束时刻不计', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const start = new Date(t.clock.now.getTime());
    const end = new Date(start.getTime() + H);
    const id = await insertActivity(t, { shardId, spec: goals(), startsAt: start, endsAt: end });
    await act(r, 'market.buy');
    t.clock.set(new Date(end.getTime() - 1));
    await act(r, 'market.buy', 2);
    t.clock.set(end);
    await act(r, 'market.buy');
    t.clock.set(new Date(start.getTime() - 1));
    await act(r, 'market.buy');
    t.clock.set(start);
    expect(await counters(t, id, r.restaurantId)).toEqual({ 'market.buy': 3 });
  });

  it('别的区服的活动不计；全服活动计；定义里没有的行为不计', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const other = await insertActivity(t, { shardId: await createShard(t.db), spec: goals() });
    const all = await insertActivity(t, { shardId: null, spec: goals() });
    await act(r, 'market.buy');
    await act(r, 'shop.buy');
    expect(await counters(t, other, r.restaurantId)).toEqual({});
    expect(await counters(t, all, r.restaurantId)).toEqual({ 'market.buy': 1 });
  });

  it('等级不够不计；功能关掉不计', async () => {
    const shardId = await createShard(t.db);
    const low = await newRestaurant(t, { shardId, patch: { level: 3 } });
    const id = await insertActivity(t, { shardId, spec: goals(), minLevel: 5 });
    await act(low, 'market.buy');
    expect(await counters(t, id, low.restaurantId)).toEqual({});

    const off = await createShard(t.db);
    const r = await newRestaurant(t, { shardId: off });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: off, override: JSON.stringify({ features: { activity: false } }) })
      .execute();
    const id2 = await insertActivity(t, { shardId: off, spec: goals() });
    await act(r, 'market.buy');
    expect(await counters(t, id2, r.restaurantId)).toEqual({});
  });

  it('签到通过真实服务计数', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, { shardId, spec: goals('signin') });
    await t.game.task.signIn(r);
    expect(await counters(t, id, r.restaurantId)).toEqual({ signin: 1 });
  });

  it('战令：每次加分、每天上限；一次 n=3 跨上限只加到上限；跨游戏日重置', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await insertActivity(t, {
      shardId,
      spec: {
        kind: 'pass',
        def: {
          rules: [{ key: 'market.buy', points: 5, dailyCap: 12 }],
          levels: [{ points: 10, free: award, premium: null }],
          unlock: { diamond: 1 },
        },
      },
      endsAt: new Date(t.clock.now.getTime() + 72 * H),
    });
    await act(r, 'market.buy');
    await act(r, 'market.buy', 3);
    await act(r, 'market.buy');
    expect(await counters(t, id, r.restaurantId)).toEqual({ points: 12 });
    t.clock.advance(24 * H);
    await act(r, 'market.buy');
    expect(await counters(t, id, r.restaurantId)).toEqual({ points: 17 });
  });
});
