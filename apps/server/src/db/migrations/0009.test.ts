import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
let a: number;
beforeAll(async () => {
  shard = await createShard(db);
  a = await createRestaurantRow(db, shard, await createAccountRow(db));
});

// 克拉肯的两张表（kraken_feed、tentacle_shop）在 0069 删掉了，种子（rest_seed）在 0072 删掉了
describe('迁移 0009', () => {
  it('每家店一个试炼对象', async () => {
    await db.insertInto('rest_trial').values({ rest_id: a, mc_id: 1, way: 2 }).execute();
    await expect(
      db.insertInto('rest_trial').values({ rest_id: a, mc_id: 2, way: 1 }).execute(),
    ).rejects.toThrow();
  });
});
