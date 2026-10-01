import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
let rest: number;
beforeAll(async () => {
  shard = await createShard(db);
  rest = await createRestaurantRow(db, shard, await createAccountRow(db));
});

async function post(category = 'chat'): Promise<number> {
  const r = await db
    .insertInto('forum_post')
    .values({ shard_id: shard, rest_id: rest, category, title: 't', content: 'c', created_at: new Date() })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}

describe('迁移 0017', () => {
  it('分类只能是三种之一', async () => {
    await expect(post('x')).rejects.toThrow();
    expect(await post('guide')).toBeGreaterThan(0);
  });

  it('同帖同楼层、同帖同店两个态度都被拒；删帖级联删回复', async () => {
    const id = await post();
    const reply = { post_id: id, rest_id: rest, floor: 1, content: 'r', created_at: new Date() };
    await db.insertInto('forum_reply').values(reply).execute();
    await expect(db.insertInto('forum_reply').values(reply).execute()).rejects.toThrow();
    const reaction = { post_id: id, rest_id: rest, kind: 'up', created_at: new Date() };
    await db.insertInto('forum_reaction').values(reaction).execute();
    await expect(
      db
        .insertInto('forum_reaction')
        .values({ ...reaction, kind: 'down' })
        .execute(),
    ).rejects.toThrow();
    await db.deleteFrom('forum_post').where('id', '=', id).execute();
    expect(await db.selectFrom('forum_reply').select('id').where('post_id', '=', id).execute()).toEqual([]);
  });
});
