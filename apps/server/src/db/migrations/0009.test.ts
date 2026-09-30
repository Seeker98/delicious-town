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

describe('迁移 0009', () => {
  it('每家店一个试炼对象；每天只能投喂一次；种子不能为负', async () => {
    await db.insertInto('rest_trial').values({ rest_id: a, mc_id: 1, way: 2 }).execute();
    await expect(
      db.insertInto('rest_trial').values({ rest_id: a, mc_id: 2, way: 1 }).execute(),
    ).rejects.toThrow();
    const feed = {
      rest_id: a,
      shard_id: shard,
      day: '2026-09-30',
      mc_id: 1,
      target_mc_id: 2,
      num: 5,
      favor: 3,
    };
    await db.insertInto('kraken_feed').values(feed).execute();
    await expect(db.insertInto('kraken_feed').values(feed).execute()).rejects.toThrow();
    await expect(
      db.insertInto('rest_seed').values({ rest_id: a, seed_id: 1, num: -1 }).execute(),
    ).rejects.toThrow();
  });

  it('触手商店按店和日期一行，格子存 JSON；删店级联', async () => {
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    await db
      .insertInto('tentacle_shop')
      .values({ rest_id: b, day: '2026-09-30', slots: JSON.stringify([{ mcId: 1, bought: false }]) })
      .execute();
    const r = await db
      .selectFrom('tentacle_shop')
      .selectAll()
      .where('rest_id', '=', b)
      .executeTakeFirstOrThrow();
    expect(r).toMatchObject({ refreshes: 0, slots: [{ mcId: 1, bought: false }] });
    await db.insertInto('rest_seed').values({ rest_id: b, seed_id: 3, num: 2 }).execute();
    await db.deleteFrom('restaurant').where('id', '=', b).execute();
    expect(await db.selectFrom('tentacle_shop').selectAll().where('rest_id', '=', b).execute()).toEqual([]);
    expect(await db.selectFrom('rest_seed').selectAll().where('rest_id', '=', b).execute()).toEqual([]);
  });
});
