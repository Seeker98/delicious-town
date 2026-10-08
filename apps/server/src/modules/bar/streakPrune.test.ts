import { afterAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime, weekStart } from '@dt/shared';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { testDb } from '../../../test/db';
import { pruneStreakBest } from './state';

const db = testDb();
afterAll(() => db.destroy());

describe('酒吧连胜榜的旧记录（517 遗留：只读本周和上周，旧的一直不删）', () => {
  it('删掉三周以前的；本周、上周、上上周的留着', async () => {
    const shardId = await createShard(db);
    const rest = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const today = '2026-10-08';
    const now = gameTime(today, 12);
    const weeks = [0, 7, 14, 21, 28].map((d) => weekStart(addDays(today, -d)));
    await db
      .insertInto('bar_streak_best')
      .values(
        weeks.map((week) => ({ rest_id: rest, game: 'fg', result: 1, week, times: 3, reached_at: now })),
      )
      .execute();
    const n = await pruneStreakBest(db, now);
    expect(n).toBe(2);
    const left = await db.selectFrom('bar_streak_best').select('week').where('rest_id', '=', rest).execute();
    expect(left.map((r) => r.week).sort()).toEqual(weeks.slice(0, 3).sort());
    expect(gameDay(now)).toBe(today);
  });
});
