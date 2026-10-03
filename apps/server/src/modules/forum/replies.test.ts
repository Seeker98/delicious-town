import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import type { RestCtx } from '../../core/deps';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const f = () => t.game.forum;
const later = (sec = 61) => t.clock.advance(sec * 1000);
async function setup() {
  const a = await newRestaurant(t, { verified: true });
  const b = await newRestaurant(t, { shardId: a.shardId, verified: true });
  const c = await newRestaurant(t, { shardId: a.shardId, verified: true });
  const id = (await f().createPost(a, { category: 'chat', title: 't', content: 'c' })).data.id;
  return { a, b, c, id };
}
const reply = (
  ctx: RestCtx,
  id: number,
  content: string,
  extra: { replyTo?: number; anonymous?: boolean } = {},
) => f().reply(ctx, id, { content, anonymous: false, ...extra });
const post = (id: number) =>
  t.db.selectFrom('forum_post').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('回复（设计文档 §2.2）', () => {
  it('楼层递增；帖子回复数和最后回复时间同步', async () => {
    const { a, b, c, id } = await setup();
    expect((await reply(a, id, '一')).data.floor).toBe(1);
    expect((await reply(b, id, '二')).data.floor).toBe(2);
    later(5);
    expect((await reply(c, id, '三', { replyTo: 1 })).data).toMatchObject({ floor: 3, replyTo: 1 });
    expect(await post(id)).toMatchObject({ reply_count: 3, last_reply_at: t.clock.now });
  });

  it('并发两条回复楼层不重复', async () => {
    const { b, c, id } = await setup();
    const rs = await Promise.all([reply(b, id, 'x'), reply(c, id, 'y')]);
    expect(rs.map((r) => r.data.floor).sort()).toEqual([1, 2]);
  });

  it('回复的楼层必须存在；冷却跨帖子；长度、邮箱、已删帖子', async () => {
    const { a, b, id } = await setup();
    later();
    const id2 = (await f().createPost(a, { category: 'chat', title: 't2', content: 'c' })).data.id;
    await expect(reply(b, id, 'x', { replyTo: 9 })).rejects.toMatchObject({ params: { reason: 'reply_to' } });
    await reply(b, id, 'x');
    later(30);
    await expect(reply(b, id2, 'y')).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'forum_reply' },
    });
    later(31);
    await expect(reply(b, id2, 'a'.repeat(501))).rejects.toMatchObject({ params: { reason: 'reply_text' } });
    await expect(reply(b, id2, '   ')).rejects.toMatchObject({ params: { reason: 'reply_text' } });
    const no = await newRestaurant(t, { shardId: a.shardId });
    await expect(reply(no, id2, 'x')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    await f().deletePost(a, id2);
    await expect(reply(b, id2, 'z')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('匿名：他人看到"匿名"，本人和管理员看到真名', async () => {
    const { a, b, c, id } = await setup();
    const m = await newRestaurant(t, { shardId: a.shardId });
    await t.db.updateTable('account').set({ role: 'mod' }).where('id', '=', m.accountId).execute();
    const r = await reply(b, id, '悄悄话', { anonymous: true });
    expect(r.data).toMatchObject({ restId: b.restaurantId, anonymous: true });
    const seen = (ctx: RestCtx) =>
      f()
        .detail(ctx, id)
        .then((x) => x.data.replies[0]!);
    expect(await seen(c)).toMatchObject({ restId: null, restName: '匿名', anonymous: true });
    expect(await seen(a)).toMatchObject({ restId: null, restName: '匿名' });
    expect((await seen(b)).restId).toBe(b.restaurantId);
    expect((await seen(m)).restId).toBe(b.restaurantId);
  });

  it('删回复：本人和管理员可以，别人不行；删后保留楼层、内容为空', async () => {
    const { a, b, c, id } = await setup();
    const m = await newRestaurant(t, { shardId: a.shardId });
    await t.db.updateTable('account').set({ role: 'admin' }).where('id', '=', m.accountId).execute();
    const r1 = (await reply(b, id, '一')).data;
    const r2 = (await reply(c, id, '二')).data;
    await expect(f().deleteReply(a, r1.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f().deleteReply(b, r1.id);
    await f().deleteReply(m, r2.id);
    await f().deleteReply(b, r1.id);
    const list = (await f().detail(c, id)).data.replies;
    expect(list.map((x) => [x.floor, x.deleted, x.content, x.canDelete])).toEqual([
      [1, true, '', false],
      [2, true, '', false],
    ]);
    const other = await newRestaurant(t, { verified: true });
    await expect(f().deleteReply(other, r1.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('任务计数（问题记录 318）', () => {
  it('回复计 post.reply；活跃"论坛发帖或回复"计入', async () => {
    const { b, id } = await setup();
    await reply(b, id, '好');
    expect(await eventCount(t, b.restaurantId, 'post.reply')).toBe(1);
    expect((await t.game.task.activation(b)).items.find((i) => i.name === '论坛发帖或回复')!.count).toBe(1);
  });
});
