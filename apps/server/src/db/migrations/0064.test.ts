import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0064：食材理财', () => {
  it('同一家店可以有几笔 active；删店时一起删', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const row = {
      shard_id: shardId,
      rest_id: restId,
      coin: 1000000,
      days: 3,
      goods_id: 10213,
      packs: 1,
      started_at: new Date(),
      matures_at: new Date(),
    };
    await db.insertInto('wealth_deposit').values([row, row]).execute();
    const rows = await db
      .selectFrom('wealth_deposit')
      .select(['status', 'coin'])
      .where('rest_id', '=', restId)
      .execute();
    expect(rows.map((r) => [r.status, r.coin])).toEqual([
      ['active', 1000000],
      ['active', 1000000],
    ]);
    await db.deleteFrom('restaurant').where('id', '=', restId).execute();
    expect(
      await db.selectFrom('wealth_deposit').select('id').where('rest_id', '=', restId).execute(),
    ).toEqual([]);
  });
});
