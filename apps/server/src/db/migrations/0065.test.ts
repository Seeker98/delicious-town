import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0065：特许大宗认购', () => {
  it('清单从期货清单复制过来；同区服同一天只能一批；出价每店每批一条，删店一起删', async () => {
    // 期货、认购清单之后都可能被别的测试改过：只要求认购清单里有东西
    const bulk = await db.selectFrom('bulk_food').select('foods_id').where('enabled', '=', true).execute();
    expect(bulk.length).toBeGreaterThan(0);

    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const now = new Date();
    const lot = {
      shard_id: shardId,
      day: '2026-10-10',
      foods_id: bulk[0]!.foods_id,
      level: 1,
      qty: 10,
      reserve: 1000,
      cap: 2,
      group_qty: 3,
      opens_at: now,
      ends_at: now,
      close_at: now,
    };
    const { id } = await db.insertInto('bulk_lot').values(lot).returning('id').executeTakeFirstOrThrow();
    await expect(db.insertInto('bulk_lot').values(lot).execute()).rejects.toThrow();
    const b = {
      lot_id: id,
      rest_id: restId,
      shard_id: shardId,
      price: 1000,
      qty: 1,
      frozen: 1000,
      ranked_at: now,
      last_bid_at: now,
    };
    await db.insertInto('bulk_bid').values(b).execute();
    await expect(db.insertInto('bulk_bid').values(b).execute()).rejects.toThrow();
    const lotRow = await db
      .selectFrom('bulk_lot')
      .select(['status', 'reserve'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(lotRow).toEqual({ status: 'open', reserve: 1000 });
    await db.deleteFrom('restaurant').where('id', '=', restId).execute();
    expect(await db.selectFrom('bulk_bid').select('rest_id').where('lot_id', '=', id).execute()).toEqual([]);
  });
});
