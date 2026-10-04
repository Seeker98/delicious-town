import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0046：限时个性图标（240-2 发展基金）', () => {
  it('不写到期时间是永久（空）；可以写到期时间', async () => {
    const shardId = await createShard(db);
    const restId = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const at = new Date('2026-10-12T00:00:00Z');
    await db
      .insertInto('rest_icon')
      .values([
        { rest_id: restId, icon_key: 'founder' },
        { rest_id: restId, icon_key: 'fund_c', expires_at: at },
      ])
      .execute();
    const rows = await db
      .selectFrom('rest_icon')
      .select(['icon_key', 'expires_at'])
      .where('rest_id', '=', restId)
      .orderBy('id')
      .execute();
    expect(rows).toEqual([
      { icon_key: 'founder', expires_at: null },
      { icon_key: 'fund_c', expires_at: at },
    ]);
  });
});
