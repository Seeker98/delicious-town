import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

// 种子和触手的折算（convertLegacy）要读 rest_seed，这张表在 0072 删掉了，测不了
describe('迁移 0069：时令', () => {
  it('余额不能为负；删店一起删', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    await expect(
      db.insertInto('rest_shiling').values({ rest_id: a, shard_id: shard, balance: -1 }).execute(),
    ).rejects.toThrow();
    await db.insertInto('rest_shiling').values({ rest_id: a, shard_id: shard, balance: 5 }).execute();
    await db.deleteFrom('restaurant').where('id', '=', a).execute();
    expect(await db.selectFrom('rest_shiling').select('rest_id').where('rest_id', '=', a).execute()).toEqual(
      [],
    );
  });
});
