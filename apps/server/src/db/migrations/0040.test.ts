import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { reviseCookbooks } from './0039_old_street_revision';
import { MOVE_176 } from './0040_move_176';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

describe('迁移 0040：左宗棠鸡移到杂碎街（问题记录 284）', () => {
  it('学过 176 的店：湖南街已学数减一，杂碎街加一', async () => {
    const id = await createRestaurantRow(db, shard, await createAccountRow(db), {
      cookbook_counts: JSON.stringify({
        learned: 1,
        grade: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
        street: { '1': 1 },
      }),
    });
    const levels = Buffer.alloc(18747);
    levels[176] = 2;
    await db.insertInto('restaurant_cookbooks').values({ rest_id: id, levels }).execute();
    await reviseCookbooks(db, [], MOVE_176, [id]);
    const r = await db
      .selectFrom('restaurant')
      .select('cookbook_counts')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(r.cookbook_counts).toEqual({
      learned: 1,
      grade: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      street: { '1': 0, '29': 1 },
    });
  });
});
