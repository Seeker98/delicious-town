import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { createGame } from '../../game';
import { gameDay, weekStart } from '@dt/shared';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('任务事件处理器', () => {
  it('同一个事件总线上多次 createGame 也只注册一次，计数不会翻倍', async () => {
    createGame(t.deps);
    const ctx = await newRestaurant(t, { patch: { attr_left: 3 } });
    await t.game.growth.allocate(ctx, { cook: 1, cutting: 0, fire: 0 });
    const row = await t.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'attr.allocate')
      .executeTakeFirstOrThrow();
    expect(row.count).toBe(1);
  });
});

describe('每周计数（问题记录 318）', () => {
  it('每周任务用到的键按本周累加；用不到的键不写', async () => {
    const ctx = await newRestaurant(t);
    await t.deps.bus.emit(t.db, {
      name: 'action',
      shardId: ctx.shardId,
      restId: ctx.restaurantId,
      payload: { key: 'market.buy', n: 2, star: 0, level: 1, at: t.clock.now.toISOString() },
      events: [],
    });
    await t.deps.bus.emit(t.db, {
      name: 'action',
      shardId: ctx.shardId,
      restId: ctx.restaurantId,
      payload: { key: 'bar.slot', n: 1, star: 0, level: 1, at: t.clock.now.toISOString() },
      events: [],
    });
    const rows = await t.db
      .selectFrom('weekly_counter')
      .select(['key', 'count', 'week'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(rows.map((r) => [r.key, r.count])).toEqual([['market.buy', 2]]);
    expect(String(rows[0]!.week)).toBe(weekStart(gameDay(t.clock.now)));
  });
});
