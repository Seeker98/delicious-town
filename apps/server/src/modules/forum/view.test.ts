import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import type { RestCtx } from '../../core/deps';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const f = () => t.game.forum;
let minute = 0;
async function insertPost(ctx: RestCtx, patch: Record<string, unknown> = {}): Promise<number> {
  minute += 1;
  const r = await t.db
    .insertInto('forum_post')
    .values({
      shard_id: ctx.shardId,
      rest_id: ctx.restaurantId,
      category: 'chat',
      title: '标题',
      content: '正文',
      created_at: new Date(gameTime(DAY, 8).getTime() + minute * 60_000),
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const ids = (xs: Array<{ id: number }>) => xs.map((x) => x.id);
const post = (id: number) =>
  t.db.selectFrom('forum_post').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('列表和搜索（设计文档 §2.5）', () => {
  it('分类筛选；按最后动态时间倒序，有回复的排前', async () => {
    const a = await newRestaurant(t);
    const chat = await insertPost(a);
    const guide = await insertPost(a, { category: 'guide' });
    const old = await insertPost(a, { last_reply_at: gameTime(DAY, 11) });
    expect(ids((await f().list(a, { tab: 'guide' })).items)).toEqual([guide]);
    expect(ids((await f().list(a, { tab: 'all' })).items)).toEqual([old, guide, chat]);
  });

  it('关键词按字面匹配 % 和 _，不区分大小写；太长被拒', async () => {
    const a = await newRestaurant(t);
    const p1 = await insertPost(a, { title: '100%_OK' });
    const p2 = await insertPost(a, { title: '100XYok' });
    expect(ids((await f().list(a, { tab: 'all', q: '%_' })).items)).toEqual([p1]);
    expect(ids((await f().list(a, { tab: 'all', q: 'OK' })).items).sort()).toEqual([p1, p2].sort());
    expect(ids((await f().list(a, { tab: 'all', q: '正文' })).items)).toHaveLength(2);
    await expect(f().list(a, { tab: 'all', q: 'a'.repeat(21) })).rejects.toMatchObject({
      params: { reason: 'query_text' },
    });
  });

  it('置顶只在第一页；游标翻页不重复不遗漏', async () => {
    const a = await newRestaurant(t);
    await setTuning(t, a.shardId, { forum: { pageSize: 2 } });
    const p = [await insertPost(a), await insertPost(a), await insertPost(a)];
    const pinned = await insertPost(a, { pinned_at: gameTime(DAY, 9) });
    const first = await f().list(a, { tab: 'all' });
    expect(ids(first.pinned)).toEqual([pinned]);
    expect(ids(first.items)).toEqual([p[2], p[1]]);
    expect(first.nextCursor).not.toBeNull();
    const second = await f().list(a, { tab: 'all', cursor: first.nextCursor! });
    expect(second.pinned).toEqual([]);
    expect(ids(second.items)).toEqual([p[0]]);
    expect(second.nextCursor).toBeNull();
  });

  it('精华标签按加精时间；删除的和别的区服的都不出现', async () => {
    const a = await newRestaurant(t);
    const other = await newRestaurant(t);
    const f1 = await insertPost(a, { featured_at: gameTime(DAY, 9) });
    const f2 = await insertPost(a, { featured_at: gameTime(DAY, 10) });
    await insertPost(a, { deleted_at: gameTime(DAY, 10), featured_at: gameTime(DAY, 11) });
    await insertPost(other, { featured_at: gameTime(DAY, 11) });
    const r = await f().list(a, { tab: 'featured' });
    expect(ids(r.items)).toEqual([f2, f1]);
    expect(r.pinned).toEqual([]);
    expect(r.items[0]).toMatchObject({ featured: true, pinned: false, restId: a.restaurantId });
  });

  it('我的状态：能否发帖、是否管理员、冷却', async () => {
    const a = await newRestaurant(t, { verified: true });
    expect((await f().list(a, { tab: 'all' })).me).toEqual({
      canPost: true,
      isAdmin: false,
      postReadyAt: null,
      replyReadyAt: null,
    });
    await f().createPost(a, { category: 'chat', title: 't', content: 'c' });
    expect((await f().list(a, { tab: 'all' })).me.postReadyAt).toBe(
      new Date(t.clock.now.getTime() + 60_000).toISOString(),
    );
  });
});

describe('详情和阅读（设计文档 §2.3）', () => {
  it('作者自己读不计；同一家店读 3 次算 1 个阅读；明细只有作者和管理员能看', async () => {
    const a = await newRestaurant(t);
    const b = await newRestaurant(t, { shardId: a.shardId });
    const c = await newRestaurant(t, { shardId: a.shardId });
    const m = await newRestaurant(t, { shardId: a.shardId });
    await t.db.updateTable('account').set({ role: 'admin' }).where('id', '=', m.accountId).execute();
    const id = await insertPost(a);
    await f().detail(a, id);
    expect((await post(id)).read_num).toBe(0);
    for (let i = 0; i < 3; i++) await f().detail(b, id);
    expect((await post(id)).read_num).toBe(1);
    await f().detail(c, id);
    expect((await post(id)).read_num).toBe(2);
    await t.db
      .insertInto('forum_reaction')
      .values({ post_id: id, rest_id: b.restaurantId, kind: 'up', created_at: t.clock.now })
      .execute();
    const reads = (await f().reads(a, id)).items;
    expect(reads).toHaveLength(2);
    expect(reads.find((x) => x.restId === b.restaurantId)).toMatchObject({ times: 3, reaction: 'up' });
    expect(reads.find((x) => x.restId === c.restaurantId)).toMatchObject({ times: 1, reaction: null });
    await expect(f().reads(b, id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await f().reads(m, id)).items).toHaveLength(2);
  });

  it('权限字段按身份；删除的帖子读不到', async () => {
    const a = await newRestaurant(t, { verified: true });
    const b = await newRestaurant(t, { shardId: a.shardId });
    const id = await insertPost(a, { pinned_at: gameTime(DAY, 9) });
    const mine = (await f().detail(a, id)).data;
    expect(mine.can).toEqual({ edit: true, delete: false, admin: false, reads: true, reply: true });
    expect(mine.post).toMatchObject({ id, content: '正文', editedAt: null, pinned: true });
    expect((await f().detail(b, id)).data.can).toEqual({
      edit: false,
      delete: false,
      admin: false,
      reads: false,
      reply: false,
    });
    await t.db.updateTable('forum_post').set({ deleted_at: t.clock.now }).where('id', '=', id).execute();
    await expect(f().detail(b, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
