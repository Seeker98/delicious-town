import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0066：大宗认购停更快照（问题记录 595）', () => {
  it('批次表有停更快照的几列，默认为空', async () => {
    const shardId = await createShard(db);
    const now = new Date();
    const { foods_id } = await db
      .selectFrom('bulk_food')
      .select('foods_id')
      .limit(1)
      .executeTakeFirstOrThrow();
    const lot = await db
      .insertInto('bulk_lot')
      .values({
        shard_id: shardId,
        day: '2029-01-01',
        foods_id,
        level: 1,
        qty: 10,
        reserve: 1000,
        cap: 2,
        group_qty: 3,
        opens_at: now,
        ends_at: now,
        close_at: now,
      })
      .returning(['blind_at', 'blind_price', 'blind_threshold', 'blind_demand', 'blind_bidders'])
      .executeTakeFirstOrThrow();
    expect(lot).toEqual({
      blind_at: null,
      blind_price: null,
      blind_threshold: null,
      blind_demand: null,
      blind_bidders: null,
    });
  });
});
