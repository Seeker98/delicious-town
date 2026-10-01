import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

describe('迁移 0015', () => {
  it('酒吧进行中的局：同店同游戏一行，不同游戏可以并存', async () => {
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const now = new Date();
    const row = {
      rest_id: a,
      game: 'devil',
      state: JSON.stringify({ stake: 1 }),
      started_at: now,
      updated_at: now,
    };
    await db.insertInto('bar_round').values(row).execute();
    await expect(db.insertInto('bar_round').values(row).execute()).rejects.toThrow();
    await db
      .insertInto('bar_round')
      .values({ ...row, game: 'darts' })
      .execute();
    const got = await db
      .selectFrom('bar_round')
      .select(['game', 'state'])
      .where('rest_id', '=', a)
      .orderBy('game')
      .execute();
    expect(got).toEqual([
      { game: 'darts', state: { stake: 1 } },
      { game: 'devil', state: { stake: 1 } },
    ]);
  });
});
