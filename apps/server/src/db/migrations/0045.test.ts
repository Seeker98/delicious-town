import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0045：小镇发展基金（240-2）', () => {
  it('同一家店只能有一笔 active 存款；领过的不挡', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const row = (status?: 'claimed') => ({
      shard_id: shardId,
      rest_id: restId,
      tier: 'C',
      coin: 1000000,
      medal: 93101,
      started_at: new Date(),
      matures_at: new Date(),
      ...(status ? { status } : {}),
    });
    await db.insertInto('fund_deposit').values(row()).execute();
    await expect(db.insertInto('fund_deposit').values(row()).execute()).rejects.toThrow();
    await db.insertInto('fund_deposit').values(row('claimed')).execute();
    const rows = await db
      .selectFrom('fund_deposit')
      .select(['status', 'coin'])
      .where('rest_id', '=', restId)
      .execute();
    expect(rows.map((r) => r.status).sort()).toEqual(['active', 'claimed']);
    expect(rows[0]!.coin).toBe(1000000);
  });
});
