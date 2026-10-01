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
  it('嘻哈男孩每区每天一行', async () => {
    const row = {
      shard_id: shard,
      day: '2026-10-01',
      place: 1,
      foods_id: 1,
      worth: 50000,
      created_at: new Date(),
    };
    await db.insertInto('hiphop_day').values(row).execute();
    await expect(db.insertInto('hiphop_day').values(row).execute()).rejects.toThrow();
  });

  it('打赏记录能存 1 亿；菜场货可以记进货人', async () => {
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    await db
      .insertInto('hiphop_tip')
      .values({
        shard_id: shard,
        rest_id: a,
        kind: 'coin',
        num: 100_000_000,
        worth: 20_000_000,
        created_at: new Date(),
      })
      .execute();
    const tip = await db
      .selectFrom('hiphop_tip')
      .select(['num', 'krab_coin'])
      .where('rest_id', '=', a)
      .executeTakeFirstOrThrow();
    expect(Number(tip.num)).toBe(100_000_000);
    expect(tip.krab_coin).toBe(0);
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
