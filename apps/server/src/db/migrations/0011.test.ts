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

describe('迁移 0011', () => {
  it('每店一行；默认结果为空、次数 0；slot_fail 不能为负；结果只能是 -1~1', async () => {
    const a = await newRest();
    await db.insertInto('bar_state').values({ rest_id: a }).execute();
    expect(
      await db.selectFrom('bar_state').selectAll().where('rest_id', '=', a).executeTakeFirstOrThrow(),
    ).toEqual({
      rest_id: a,
      fg_result: null,
      fg_times: 0,
      cup_result: null,
      cup_times: 0,
      num_result: null,
      num_times: 0,
      slot_fail: 0,
    });
    await expect(db.insertInto('bar_state').values({ rest_id: a }).execute()).rejects.toThrow();
    const b = await newRest();
    await expect(
      db.insertInto('bar_state').values({ rest_id: b, slot_fail: -1 }).execute(),
    ).rejects.toThrow();
    await expect(db.insertInto('bar_state').values({ rest_id: b, fg_result: 2 }).execute()).rejects.toThrow();
  });

  it('统计按（店, 奖项）唯一、数量不能为负；删店级联', async () => {
    const a = await newRest();
    await db.insertInto('bar_state').values({ rest_id: a }).execute();
    await db.insertInto('bar_slot_stat').values({ rest_id: a, award_id: 0, num: 3 }).execute();
    await expect(
      db.insertInto('bar_slot_stat').values({ rest_id: a, award_id: 0, num: 1 }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('bar_slot_stat').values({ rest_id: a, award_id: 1, num: -1 }).execute(),
    ).rejects.toThrow();
    await db.deleteFrom('restaurant').where('id', '=', a).execute();
    expect(await db.selectFrom('bar_state').select('rest_id').where('rest_id', '=', a).execute()).toEqual([]);
    expect(await db.selectFrom('bar_slot_stat').select('rest_id').where('rest_id', '=', a).execute()).toEqual(
      [],
    );
  });
});
