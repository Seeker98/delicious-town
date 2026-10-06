import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { aggregateIncomeDay, incomeSums, pruneIncomeDays } from './income';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const round = (restId: number, coin: number, at: Date, no: number) =>
  t.db
    .insertInto('income_round')
    .values({
      rest_id: restId,
      round_no: no,
      coin,
      exp: 0,
      oil: 0,
      customers: JSON.stringify({}),
      rates: JSON.stringify({}),
      drops: JSON.stringify([]),
      created_at: at,
    })
    .execute();
const daysOf = (restId: number) =>
  t.db.selectFrom('rest_income_day').selectAll().where('rest_id', '=', restId).orderBy('day').execute();

describe('每天的收入汇总（收购 PR 1）', () => {
  it('按游戏日汇总本区服每家店的结算银币和轮数；别的区服、别的日子不算；重跑结果不变', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const other = await newRestaurant(t);
    await round(a.restaurantId, 100, gameTime('2026-10-01', 0, 1), 1);
    await round(a.restaurantId, 250, gameTime('2026-10-01', 23, 59), 2);
    await round(a.restaurantId, 999, gameTime('2026-10-02', 0, 0), 3);
    await round(other.restaurantId, 7, gameTime('2026-10-01', 12), 1);
    expect(await aggregateIncomeDay(t.db, shardId, '2026-10-01')).toBe(1);
    expect(await aggregateIncomeDay(t.db, shardId, '2026-10-01')).toBe(1);
    expect(await daysOf(a.restaurantId)).toEqual([
      { rest_id: a.restaurantId, day: '2026-10-01', coin: 350, rounds: 2 },
    ]);
    expect(await daysOf(other.restaurantId)).toEqual([]);
  });

  it('区间合计 [from, to)；清理某天以前的', async () => {
    const a = await newRestaurant(t);
    await t.db
      .insertInto('rest_income_day')
      .values([
        { rest_id: a.restaurantId, day: '2000-01-01', coin: 1, rounds: 1 },
        { rest_id: a.restaurantId, day: '2000-01-11', coin: 10, rounds: 1 },
        { rest_id: a.restaurantId, day: '2000-01-12', coin: 20, rounds: 1 },
      ])
      .execute();
    expect((await incomeSums(t.db, [a.restaurantId], '2000-01-06', '2000-01-12')).get(a.restaurantId)).toBe(
      10,
    );
    expect(await incomeSums(t.db, [], '2000-01-06', '2000-01-12')).toEqual(new Map());
    await pruneIncomeDays(t.db, '2000-01-02');
    expect((await daysOf(a.restaurantId)).map((x) => x.day)).toEqual(['2000-01-11', '2000-01-12']);
  });
});
