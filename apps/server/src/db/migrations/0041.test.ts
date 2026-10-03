import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let rest: number;
beforeAll(async () => {
  rest = await createRestaurantRow(db, await createShard(db), await createAccountRow(db));
});

describe('迁移 0041：任务完成、每周计数和领取（问题记录 318）', () => {
  it('quest_done 同一家店同一个任务只能有一条', async () => {
    await db.insertInto('quest_done').values({ rest_id: rest, quest_id: 2021 }).execute();
    await expect(
      db.insertInto('quest_done').values({ rest_id: rest, quest_id: 2021 }).execute(),
    ).rejects.toThrow();
  });
  it('weekly_counter 按店、周、键唯一；weekly_claim 按店、周、任务唯一', async () => {
    await db
      .insertInto('weekly_counter')
      .values({ rest_id: rest, week: '2026-09-28', key: 'signin', count: 1 })
      .execute();
    await expect(
      db
        .insertInto('weekly_counter')
        .values({ rest_id: rest, week: '2026-09-28', key: 'signin', count: 1 })
        .execute(),
    ).rejects.toThrow();
    await db
      .insertInto('weekly_counter')
      .values({ rest_id: rest, week: '2026-10-05', key: 'signin', count: 1 })
      .execute();
    await db
      .insertInto('weekly_claim')
      .values({ rest_id: rest, week: '2026-09-28', quest_id: 4011 })
      .execute();
    await expect(
      db.insertInto('weekly_claim').values({ rest_id: rest, week: '2026-09-28', quest_id: 4011 }).execute(),
    ).rejects.toThrow();
  });
  it('restaurant.quest_version 默认 0', async () => {
    const r = await db
      .selectFrom('restaurant')
      .select('quest_version')
      .where('id', '=', rest)
      .executeTakeFirstOrThrow();
    expect(r.quest_version).toBe(0);
  });
});
