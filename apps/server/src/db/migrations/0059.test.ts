import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { backfill } from './0059_income_best';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0059：按留着的每天收入汇总补历史单日最高（支线“经营”）', () => {
  it('银币、轮数各取最大；没有汇总的店不建；已有的行取较大的', async () => {
    const shardId = await createShard(db);
    const rest = async () => createRestaurantFull(db, shardId, await createAccountRow(db));
    const [a, b, c] = [await rest(), await rest(), await rest()];
    await db
      .insertInto('rest_income_day')
      .values([
        { rest_id: a, day: '2026-10-01', coin: 500, rounds: 10 },
        { rest_id: a, day: '2026-10-02', coin: 200, rounds: 40 },
        { rest_id: c, day: '2026-10-01', coin: 100, rounds: 5 },
      ])
      .execute();
    await db.insertInto('rest_income_best').values({ rest_id: c, day_coin: 900, day_rounds: 1 }).execute();
    await backfill(db);
    const rows = await db
      .selectFrom('rest_income_best')
      .selectAll()
      .where('rest_id', 'in', [a, b, c])
      .orderBy('rest_id')
      .execute();
    expect(rows).toEqual([
      { rest_id: a, day_coin: 500, day_rounds: 40 },
      { rest_id: c, day_coin: 900, day_rounds: 5 },
    ]);
  });
});
