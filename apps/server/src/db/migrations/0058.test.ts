import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { backfill } from './0058_signin_streak';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0058：按留着的每日签到补连续签到（问题记录 515 支线扩充 B）', () => {
  it('最后一段是现在连续的天数，最长一段是历史最长；没签过的不建；已有的行不动', async () => {
    const shardId = await createShard(db);
    const rest = async () => createRestaurantFull(db, shardId, await createAccountRow(db));
    const [a, b, c] = [await rest(), await rest(), await rest()];
    const signed = (restId: number, days: string[]) =>
      db
        .insertInto('daily_counter')
        .values(days.map((day) => ({ rest_id: restId, day, key: 'signin', count: 1 })))
        .execute();
    // a：三天连着、断一天、再两天
    await signed(a, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']);
    await db
      .insertInto('daily_counter')
      .values({ rest_id: a, day: '2026-10-04', key: 'oil.fill', count: 1 })
      .execute();
    await signed(c, ['2026-10-06']);
    await db
      .insertInto('signin_streak')
      .values({ rest_id: c, last_day: '2026-10-06', streak: 9, best: 9 })
      .execute();
    await backfill(db);
    const rows = await db
      .selectFrom('signin_streak')
      .selectAll()
      .where('rest_id', 'in', [a, b, c])
      .orderBy('rest_id')
      .execute();
    expect(rows).toEqual([
      { rest_id: a, last_day: '2026-10-06', streak: 2, best: 3 },
      { rest_id: c, last_day: '2026-10-06', streak: 9, best: 9 },
    ]);
  });
});
