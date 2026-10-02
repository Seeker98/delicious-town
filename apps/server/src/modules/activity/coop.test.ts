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
    t.clock.set(new Date('2099-01-02T00:00:00Z'));
    const id = await insertActivity(t, {
      shardId: null,
      spec: spec(),
      startsAt: new Date('2099-01-01T00:00:00Z'),
      endsAt: new Date('2099-01-10T00:00:00Z'),
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
