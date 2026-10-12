import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

describe('迁移 0016', () => {
  // 嘻哈男孩的两张表在 0070 删掉了（天气改版 PR③）
  it('菜场货可以记进货人', async () => {
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const item = await db
      .insertInto('market_item')
      .values({
        shard_id: shard,
        shelf: 0,
        period: 'p',
        foods_id: 1,
        stock: 10,
        opened_at: new Date(),
        owner_rest_id: a,
      })
      .returning('owner_rest_id')
      .executeTakeFirstOrThrow();
    expect(item.owner_rest_id).toBe(a);
  });
});
