import { afterAll, describe, expect, it } from 'vitest';
import { gameDay, weekStart } from '@dt/shared';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { backfill } from './0055_bar_streak_best';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0055：上线时把现在的连胜、连败记进本周（问题记录 517）', () => {
  it('结果是胜或负的写进本周（北京时间的周一）；平局、没玩过的不写；已有的不动', async () => {
    const shardId = await createShard(db);
    const rest = async () => createRestaurantFull(db, shardId, await createAccountRow(db));
    const [a, b] = [await rest(), await rest()];
    await db
      .insertInto('bar_state')
      .values([
        { rest_id: a, fg_result: 1, fg_times: 6, cup_result: 0, cup_times: 2, num_result: -1, num_times: 3 },
        { rest_id: b, fg_result: null, fg_times: 0 },
      ])
      .execute();
    const week = weekStart(gameDay(new Date()));
    await db
      .insertInto('bar_streak_best')
      .values({ rest_id: a, game: 'num', result: -1, week, times: 9, reached_at: new Date('2026-01-01') })
      .execute();
    await backfill(db);
    const rows = await db
      .selectFrom('bar_streak_best')
      .select(['rest_id', 'game', 'result', 'week', 'times'])
      .where('rest_id', 'in', [a, b])
      .orderBy(['rest_id', 'game'])
      .execute();
    expect(rows.map((r) => ({ ...r, week: String(r.week) }))).toEqual([
      { rest_id: a, game: 'fg', result: 1, week, times: 6 },
      { rest_id: a, game: 'num', result: -1, week, times: 9 },
    ]);
  });
});
