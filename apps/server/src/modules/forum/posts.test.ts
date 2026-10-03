import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import type { RestCtx } from '../../core/deps';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const f = () => t.game.forum;
const body = (patch: Record<string, string> = {}) => ({
  category: 'chat' as const,
  title: '标题',
  content: '正文',
  ...patch,
});
const later = (sec = 61) => t.clock.advance(sec * 1000);
async function makeAdmin(ctx: RestCtx): Promise<void> {
  await t.db.updateTable('account').set({ role: 'mod' }).where('id', '=', ctx.accountId).execute();
}
const row = (id: number) =>
  t.db.selectFrom('forum_post').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('发帖、编辑、删帖（设计文档 §2.1）', () => {
  it('发帖成功：规整文字，支线 107 完成', async () => {
    const a = await newRestaurant(t, { verified: true });
    const { data } = await f().createPost(a, body({ title: '  标题  ', content: 'a\r\n\n\n\nb' }));
    expect(await row(data.id)).toMatchObject({
      title: '标题',
      content: 'a\n\nb',
      category: 'chat',
      rest_id: a.restaurantId,
    });
    await showQuest(t, a.restaurantId, 2124);
    expect(questIn(await t.game.task.tasks(a), 2124)?.progress).toBe(1);
  });

  it('未验证邮箱、长度不对被拒；标题 40 个 emoji 可以', async () => {
    const no = await newRestaurant(t);
    await expect(f().createPost(no, body())).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    const a = await newRestaurant(t, { verified: true });
    await expect(f().createPost(a, body({ title: 'a'.repeat(41) }))).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'post_text' },
    });
    await expect(f().createPost(a, body({ content: '   \n  ' }))).rejects.toMatchObject({
      params: { reason: 'post_text' },
    });
    await expect(f().createPost(a, body({ title: '😀'.repeat(40) }))).resolves.toBeDefined();
  });

  it('60 秒冷却；每天最多 10 篇，跨天重置', async () => {
    const a = await newRestaurant(t, { verified: true });
    await f().createPost(a, body());
    await expect(f().createPost(a, body())).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'forum_post' },
    });
    for (let i = 0; i < 9; i++) {
      later();
      await f().createPost(a, body());
    }
    later();
    await expect(f().createPost(a, body())).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'forum_post' },
    });
    t.clock.set(gameTime('2026-10-02', 12));
    await expect(f().createPost(a, body())).resolves.toBeDefined();
  });

  it('编辑：作者和管理员可以，别人不行；记编辑时间', async () => {
    const a = await newRestaurant(t, { verified: true });
    const b = await newRestaurant(t, { shardId: a.shardId, verified: true });
    const m = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await makeAdmin(m);
    const { data } = await f().createPost(a, body());
    later(10);
    await f().editPost(a, data.id, body({ title: '新标题', category: 'guide' }));
    expect(await row(data.id)).toMatchObject({ title: '新标题', category: 'guide', edited_at: t.clock.now });
    await expect(f().editPost(b, data.id, body())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f().editPost(m, data.id, body({ title: '管理员改的' }))).resolves.toBeDefined();
    await expect(f().editPost(a, data.id, body({ title: '' }))).rejects.toMatchObject({
      params: { reason: 'post_text' },
    });
  });

  it('删帖：作者删普通帖；置顶的作者删不了，管理员能删；删后读不到', async () => {
    const a = await newRestaurant(t, { verified: true });
    const m = await newRestaurant(t, { shardId: a.shardId, verified: true });
    await makeAdmin(m);
    const p1 = (await f().createPost(a, body())).data.id;
    later();
    const p2 = (await f().createPost(a, body())).data.id;
    await f().deletePost(a, p1);
    expect((await row(p1)).deleted_at).not.toBeNull();
    await expect(f().editPost(a, p1, body())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await t.db.updateTable('forum_post').set({ pinned_at: t.clock.now }).where('id', '=', p2).execute();
    await expect(f().deletePost(a, p2)).rejects.toMatchObject({ params: { reason: 'post_locked' } });
    await f().deletePost(m, p2);
    expect((await row(p2)).deleted_at).not.toBeNull();
  });

  it('跨区服当作不存在', async () => {
    const a = await newRestaurant(t, { verified: true });
    const other = await newRestaurant(t, { verified: true });
    await makeAdmin(other);
    const { data } = await f().createPost(a, body());
    await expect(f().editPost(other, data.id, body())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(f().deletePost(other, data.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
