import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { loadTarget } from './targets';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('举报对象（设计 §3.2）', () => {
  it('五种内容：取到店、店主和当前文字；删除的、不存在的为 null', async () => {
    const r = await newRestaurant(t, { patch: { notice: '招人' } });
    const post = await t.db
      .insertInto('forum_post')
      .values({
        shard_id: r.shardId,
        rest_id: r.restaurantId,
        category: 'chat',
        title: '标题',
        content: '正文',
        created_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const reply = await t.db
      .insertInto('forum_reply')
      .values({
        post_id: post.id,
        rest_id: r.restaurantId,
        floor: 1,
        content: '回复内容',
        created_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const news = await t.db
      .insertInto('news')
      .values({
        shard_id: r.shardId,
        type: 'town.broadcast',
        rest_id: r.restaurantId,
        params: JSON.stringify({ text: '大家好' }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const who = { shardId: r.shardId, restId: r.restaurantId, accountId: r.accountId };
    expect(await loadTarget(t.db, 'post', post.id)).toEqual({ ...who, text: '标题\n正文' });
    expect(await loadTarget(t.db, 'reply', reply.id)).toEqual({ ...who, text: '回复内容' });
    expect(await loadTarget(t.db, 'broadcast', news.id)).toEqual({ ...who, text: '大家好' });
    expect(await loadTarget(t.db, 'notice', r.restaurantId)).toEqual({ ...who, text: '招人' });
    expect((await loadTarget(t.db, 'rest_name', r.restaurantId))!.text.length).toBeGreaterThan(0);
    await t.db.updateTable('forum_post').set({ deleted_at: new Date() }).where('id', '=', post.id).execute();
    expect(await loadTarget(t.db, 'post', post.id)).toBeNull();
    expect(await loadTarget(t.db, 'reply', reply.id)).toBeNull();
    expect(await loadTarget(t.db, 'broadcast', 99999999)).toBeNull();
  });
});
