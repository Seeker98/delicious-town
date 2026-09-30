import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

const newRest = async () => createRestaurantRow(db, shard, await createAccountRow(db));
const now = new Date();

describe('迁移 0013', () => {
  it('开通状态每店一行，骑手上限默认 1', async () => {
    const a = await newRest();
    await db.insertInto('takeaway_state').values({ rest_id: a, opened_at: now }).execute();
    expect(
      await db
        .selectFrom('takeaway_state')
        .select('rider_cap')
        .where('rest_id', '=', a)
        .executeTakeFirstOrThrow(),
    ).toEqual({ rider_cap: 1 });
    await expect(
      db.insertInto('takeaway_state').values({ rest_id: a, opened_at: now }).execute(),
    ).rejects.toThrow();
  });

  it('骑手：同一雇主不能重复雇同一人；一家店只能被一个别人雇；自己给自己当骑手不算；等级 1~50', async () => {
    const a = await newRest();
    const b = await newRest();
    const c = await newRest();
    const r = await db
      .insertInto('takeaway_rider')
      .values({ rest_id: a, rider_rest_id: a, hired_at: now })
      .returning(['id', 'level', 'exp'])
      .executeTakeFirstOrThrow();
    expect(r).toMatchObject({ level: 1, exp: 0 });
    await db.insertInto('takeaway_rider').values({ rest_id: c, rider_rest_id: c, hired_at: now }).execute();
    await db.insertInto('takeaway_rider').values({ rest_id: a, rider_rest_id: c, hired_at: now }).execute();
    await expect(
      db.insertInto('takeaway_rider').values({ rest_id: b, rider_rest_id: c, hired_at: now }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('takeaway_rider').values({ rest_id: a, rider_rest_id: a, hired_at: now }).execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('takeaway_rider')
        .values({ rest_id: b, rider_rest_id: b, hired_at: now, level: 51 })
        .execute(),
    ).rejects.toThrow();
  });

  it('外卖单和配送：品级 1~7；一张单只能有一次配送；删单级联删配送', async () => {
    const a = await newRest();
    const rider = await db
      .insertInto('takeaway_rider')
      .values({ rest_id: a, rider_rest_id: a, hired_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    const order = {
      shard_id: shard,
      cookbook_id: 1,
      grade: 1,
      need_minutes: 30,
      need_renown: 3,
      created_at: now,
      expires_at: now,
    };
    await expect(
      db
        .insertInto('takeaway_order')
        .values({ ...order, grade: 8 })
        .execute(),
    ).rejects.toThrow();
    const o = await db
      .insertInto('takeaway_order')
      .values(order)
      .returning(['id', 'state', 'owner_rest_id'])
      .executeTakeFirstOrThrow();
    expect(o).toMatchObject({ state: 1, owner_rest_id: null });
    const v = {
      order_id: o.id,
      rest_id: a,
      rider_id: rider.id,
      grade: 1,
      private: false,
      double: false,
      mystery_kinds: 0,
      coin: 198,
      exp: 13,
      renown: 1,
      success_odds: 820,
      started_at: now,
      arrive_at: now,
    };
    const d = await db
      .insertInto('takeaway_delivery')
      .values(v)
      .returning(['id', 'state', 'drone'])
      .executeTakeFirstOrThrow();
    expect(d).toMatchObject({ state: 1, drone: false });
    await expect(db.insertInto('takeaway_delivery').values(v).execute()).rejects.toThrow();
    await db.deleteFrom('takeaway_order').where('id', '=', o.id).execute();
    expect(await db.selectFrom('takeaway_delivery').select('id').where('id', '=', d.id).execute()).toEqual(
      [],
    );
  });
});
