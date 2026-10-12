import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { convertLegacy } from './0069_shiling';

/** 触手（退役了，迁移里按编号折算） */
const TENTACLE = gid('克拉肯断裂的触手');

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0069：时令', () => {
  it('种子每颗折 5、触手每条折 30 记入余额，不算本周获得；种子和触手清掉', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const c = await createRestaurantRow(db, shard, await createAccountRow(db));
    await db
      .insertInto('rest_seed')
      .values([
        { rest_id: a, seed_id: 1, num: 3 },
        { rest_id: a, seed_id: 2, num: 1 },
        { rest_id: b, seed_id: 1, num: 0 },
      ])
      .execute();
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: TENTACLE, num: 1 },
        { rest_id: c, goods_id: TENTACLE, num: 2 },
      ])
      .execute();
    await convertLegacy(db, [a, b, c]);
    const rows = await db
      .selectFrom('rest_shiling')
      .select(['rest_id', 'balance', 'week_gain'])
      .where('rest_id', 'in', [a, b, c])
      .orderBy('rest_id')
      .execute();
    expect(rows).toEqual([
      { rest_id: a, balance: 4 * 5 + 30, week_gain: 0 },
      { rest_id: c, balance: 60, week_gain: 0 },
    ]);
    expect(
      await db.selectFrom('rest_seed').select('rest_id').where('rest_id', 'in', [a, b]).execute(),
    ).toEqual([]);
    expect(
      await db
        .selectFrom('store_item')
        .select('rest_id')
        .where('goods_id', '=', TENTACLE)
        .where('rest_id', 'in', [a, c])
        .execute(),
    ).toEqual([]);
  });

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
