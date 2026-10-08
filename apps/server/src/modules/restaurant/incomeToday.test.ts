import { afterAll, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { incomePage } from './reads';

const db = testDb();
afterAll(() => db.destroy());

const round = (restId: number, no: number, coin: number, at: Date) =>
  db
    .insertInto('income_round')
    .values({
      rest_id: restId,
      round_no: no,
      coin,
      exp: coin * 2,
      oil: 1,
      customers: JSON.stringify({}),
      rates: JSON.stringify({}),
      drops: JSON.stringify([]),
      created_at: at,
    })
    .execute();

describe('收益记录的今日小计（530 遗留：缺的测试）', () => {
  it('按北京时间 0 点切：前一天 23:59 的不算，当天 00:01 起的算', async () => {
    const shardId = await createShard(db);
    const rest = await createRestaurantFull(db, shardId, await createAccountRow(db));
    await round(rest, 1, 1000, gameTime('2026-10-07', 23, 59));
    await round(rest, 2, 300, gameTime('2026-10-08', 0, 1));
    await round(rest, 3, 200, gameTime('2026-10-08', 9));
    const page = await incomePage(db, rest, { limit: 20 }, gameTime('2026-10-08', 12));
    expect(page.items).toHaveLength(3);
    expect(page.today).toEqual({ rounds: 2, coin: 500, exp: 1000, oil: 2 });
    // 0 点刚过（另一家店，只有前一天 23:59 和当天 00:01 两轮）：只算 00:01 那一轮
    const early = await createRestaurantFull(db, shardId, await createAccountRow(db));
    await round(early, 1, 1000, gameTime('2026-10-07', 23, 59));
    await round(early, 2, 300, gameTime('2026-10-08', 0, 1));
    expect((await incomePage(db, early, { limit: 20 }, gameTime('2026-10-08', 0, 5))).today).toEqual({
      rounds: 1,
      coin: 300,
      exp: 600,
      oil: 1,
    });
  });

  it('翻页（带 before）不再给今日小计；今天一轮都没有时是 0', async () => {
    const shardId = await createShard(db);
    const rest = await createRestaurantFull(db, shardId, await createAccountRow(db));
    await round(rest, 1, 100, gameTime('2026-10-06', 10));
    await round(rest, 2, 100, gameTime('2026-10-06', 11));
    const now = gameTime('2026-10-08', 12);
    const first = await incomePage(db, rest, { limit: 1 }, now);
    expect(first.today).toEqual({ rounds: 0, coin: 0, exp: 0, oil: 0 });
    expect(first.nextBefore).not.toBeNull();
    const next = await incomePage(db, rest, { limit: 1, before: first.nextBefore! }, now);
    expect(next.items).toHaveLength(1);
    expect(next.today).toBeUndefined();
  });
});
