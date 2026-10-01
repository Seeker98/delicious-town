import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));
const f = () => t.game.forum;

/** 在另一个事务里锁住某家店，执行 fn；fn 在 1.5 秒内完成返回 'done'，否则 'blocked' */
async function whileLocked(restId: number, fn: () => Promise<unknown>): Promise<string> {
  let release!: () => void;
  let locked!: () => void;
  const isLocked = new Promise<void>((r) => (locked = r));
  const held = t.db.transaction().execute(async (tx) => {
    await tx.selectFrom('restaurant').select('id').where('id', '=', restId).forUpdate().execute();
    locked();
    await new Promise<void>((r) => (release = r));
  });
  await isLocked;
  const r = await Promise.race([
    fn().then(
      () => 'done',
      () => 'done',
    ),
    new Promise<string>((res) => setTimeout(() => res('blocked'), 1500)),
  ]);
  release();
  await held;
  return r;
}

async function setup() {
  const a = await newRestaurant(t, { verified: true });
  const b = await newRestaurant(t, { shardId: a.shardId, verified: true });
  const id = (await f().createPost(a, { category: 'chat', title: '原标题', content: '正文' })).data.id;
  return { a, b, id };
}
const makeAdmin = (c: RestCtx) =>
  t.db.updateTable('account').set({ role: 'admin' }).where('id', '=', c.accountId).execute();

describe('论坛遗留问题（PR31）', () => {
  it('普通玩家调管理接口：先查权限，直接拒绝，不去锁作者的店', async () => {
    const { a, b, id } = await setup();
    expect(await whileLocked(a.restaurantId, () => f().admin(b, id, 'pin'))).toBe('done');
    await expect(f().admin(b, id, 'pin')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('看阅读明细是纯读，不锁自己的店', async () => {
    const { a, id } = await setup();
    expect(await whileLocked(a.restaurantId, () => f().reads(a, id))).toBe('done');
    expect(await f().reads(a, id)).toEqual({ items: [] });
  });

  it('编辑页取正文：不记阅读、不带回复；只有作者和管理员能取', async () => {
    const { a, b, id } = await setup();
    expect(await f().source(a, id)).toEqual({ id, category: 'chat', title: '原标题', content: '正文' });
    await expect(f().source(b, id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await makeAdmin(b);
    await f().source(b, id);
    expect(await t.db.selectFrom('forum_read').select('rest_id').where('post_id', '=', id).execute()).toEqual(
      [],
    );
  });

  it('置顶新闻里的标题随编辑更新；删帖后这条新闻也删掉', async () => {
    const { a, b, id } = await setup();
    await makeAdmin(b);
    await f().admin(b, id, 'pin');
    await f().editPost(a, id, { category: 'chat', title: '新标题', content: '正文' });
    const news = () =>
      t.db
        .selectFrom('news')
        .select('params')
        .where('shard_id', '=', a.shardId)
        .where('type', '=', 'forum.pin')
        .execute();
    expect((await news()).map((n) => n.params)).toEqual([{ postId: id, title: '新标题' }]);
    await f().deletePost(b, id);
    expect(await news()).toEqual([]);
  });
});
