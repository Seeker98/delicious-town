import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const f = () => t.game.forum;
async function setup() {
  const a = await newRestaurant(t, { verified: true, patch: { diamond: 0 } });
  const b = await newRestaurant(t, { shardId: a.shardId, verified: true });
  const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
  const m = await newRestaurant(t, { shardId: a.shardId, verified: true, patch: { diamond: 0 } });
  await t.db.updateTable('account').set({ role: 'mod' }).where('id', '=', m.accountId).execute();
  const id = (await f().createPost(a, { category: 'guide', title: '攻略', content: 'c' })).data.id;
  return { a, b, c, m, id };
}
const post = (id: number) =>
  t.db.selectFrom('forum_post').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const news = async (shardId: number, type: string) =>
  (
    await t.db
      .selectFrom('news')
      .select('type')
      .where('shard_id', '=', shardId)
      .where('type', '=', type)
      .execute()
  ).length;

describe('赞和踩（设计文档 §2.3）', () => {
  it('加、取消、切换时计数正确', async () => {
    const { b, id } = await setup();
    expect((await f().react(b, id, 'up')).data).toEqual({ mine: 'up', up: 1, down: 0 });
    expect((await f().react(b, id, 'up')).data).toEqual({ mine: null, up: 0, down: 0 });
    await f().react(b, id, 'up');
    expect((await f().react(b, id, 'down')).data).toEqual({ mine: 'down', up: 0, down: 1 });
    expect((await f().detail(b, id)).data.mine).toBe('down');
  });

  it('两家店同时点赞，赞数为 2；删除的帖子不能点', async () => {
    const { a, b, c, id } = await setup();
    await Promise.all([f().react(b, id, 'up'), f().react(c, id, 'up')]);
    expect((await post(id)).up_num).toBe(2);
    await f().deletePost(a, id);
    await expect(f().react(b, id, 'up')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('置顶和加精（设计文档 §2.4）', () => {
  it('普通玩家不能管理', async () => {
    const { b, id } = await setup();
    await expect(f().admin(b, id, 'pin')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('置顶写新闻；重复置顶不重复写；取消后清空', async () => {
    const { a, m, id } = await setup();
    expect((await f().admin(m, id, 'pin')).data).toEqual({ pinned: true, featured: false, rewarded: false });
    await f().admin(m, id, 'pin');
    expect(await news(a.shardId, 'forum.pin')).toBe(1);
    await f().admin(m, id, 'unpin');
    expect((await post(id)).pinned_at).toBeNull();
  });

  it('第一次加精给作者发奖励并写新闻；取消再加精不再发；加精后作者删不了', async () => {
    const { a, m, id } = await setup();
    const r = await f().admin(m, id, 'feature');
    expect(r.data).toEqual({ pinned: false, featured: true, rewarded: true });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(20);
    expect((await restRow(t, a.restaurantId)).diamond).toBe(50);
    expect(await news(a.shardId, 'forum.feature')).toBe(1);
    await f().admin(m, id, 'unfeature');
    expect((await f().admin(m, id, 'feature')).data.rewarded).toBe(false);
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(20);
    expect(await news(a.shardId, 'forum.feature')).toBe(1);
    await expect(f().deletePost(a, id)).rejects.toMatchObject({ params: { reason: 'post_locked' } });
  });

  it('管理员加精自己的帖子也能拿到奖励', async () => {
    const { m } = await setup();
    t.clock.advance(61_000);
    const own = (await f().createPost(m, { category: 'chat', title: 'mine', content: 'c' })).data.id;
    expect((await f().admin(m, own, 'feature')).data.rewarded).toBe(true);
    expect((await restRow(t, m.restaurantId)).diamond).toBe(50);
  });
});
