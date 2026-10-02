import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let rest: number;
let activity: number;
beforeAll(async () => {
  const shard = await createShard(db);
  rest = await createRestaurantRow(db, shard, await createAccountRow(db));
  activity = (
    await db
      .insertInto('activity')
      .values({
        shard_id: shard,
        kind: 'goals',
        title: 't',
        body: 'b',
        starts_at: new Date(),
        ends_at: new Date(Date.now() + 3_600_000),
        def: JSON.stringify({ goals: [] }),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
});

describe('迁移 0021', () => {
  it('同一活动、店、奖励键只能领一次', async () => {
    const row = { activity_id: activity, rest_id: rest, reward_key: 'g0', via: 'page' as const };
    await db.insertInto('activity_claim').values(row).execute();
    await expect(db.insertInto('activity_claim').values(row).execute()).rejects.toThrow();
  });
  it('结束时间必须晚于开始时间', async () => {
    const now = new Date();
    await expect(
      db
        .insertInto('activity')
        .values({
          shard_id: null,
          kind: 'goals',
          title: 't',
          body: 'b',
          starts_at: now,
          ends_at: now,
          def: '{}',
        })
        .execute(),
    ).rejects.toThrow();
  });
});
