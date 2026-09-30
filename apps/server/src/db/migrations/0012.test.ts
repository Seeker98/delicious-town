import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

const newRest = async () => createRestaurantRow(db, shard, await createAccountRow(db));

describe('迁移 0012', () => {
  it('每店一行最高层，默认 0，只能 0~10', async () => {
    const a = await newRest();
    await db.insertInto('tower_state').values({ rest_id: a }).execute();
    expect(
      await db.selectFrom('tower_state').selectAll().where('rest_id', '=', a).executeTakeFirstOrThrow(),
    ).toEqual({ rest_id: a, best_floor: 0 });
    await expect(db.insertInto('tower_state').values({ rest_id: a }).execute()).rejects.toThrow();
    const b = await newRest();
    await expect(
      db.insertInto('tower_state').values({ rest_id: b, best_floor: 11 }).execute(),
    ).rejects.toThrow();
  });

  it('守塔人的菜每区服每层一行；层 1~10；价值不能为负', async () => {
    const row = { shard_id: shard, floor: 4, mc_id: 2, price: 50, day: '2026-09-30' };
    await db.insertInto('tower_watchman_mc').values(row).execute();
    await expect(db.insertInto('tower_watchman_mc').values(row).execute()).rejects.toThrow();
    await expect(
      db
        .insertInto('tower_watchman_mc')
        .values({ ...row, floor: 11 })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('tower_watchman_mc')
        .values({ ...row, floor: 5, price: -1 })
        .execute(),
    ).rejects.toThrow();
  });

  it('赛厨榜：一格一人、同一周一家店只占一格、名次 1~15、删店级联', async () => {
    const a = await newRest();
    const b = await newRest();
    const week = '2026-09-28';
    await db.insertInto('tower_rank').values({ shard_id: shard, week, rank: 1, rest_id: a }).execute();
    await expect(
      db.insertInto('tower_rank').values({ shard_id: shard, week, rank: 1, rest_id: b }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('tower_rank').values({ shard_id: shard, week, rank: 2, rest_id: a }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('tower_rank').values({ shard_id: shard, week, rank: 16, rest_id: b }).execute(),
    ).rejects.toThrow();
    await db
      .insertInto('tower_rank')
      .values({ shard_id: shard, week: '2026-10-05', rank: 1, rest_id: a })
      .execute();
    await db.deleteFrom('restaurant').where('id', '=', a).execute();
    expect(await db.selectFrom('tower_rank').select('rank').where('rest_id', '=', a).execute()).toEqual([]);
  });
});
