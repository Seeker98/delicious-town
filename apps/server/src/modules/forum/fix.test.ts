import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12, 34)));
const f = () => t.game.forum;

describe('终审修复（4E-3）', () => {
  it('I1：阅读明细只给到游戏日，没法和匿名回复的时间对上', async () => {
    const a = await newRestaurant(t, { verified: true });
    const b = await newRestaurant(t, { shardId: a.shardId, verified: true });
    const id = (await f().createPost(a, { category: 'chat', title: 't', content: 'c' })).data.id;
    await f().detail(b, id);
    await f().reply(b, id, { content: '悄悄话', anonymous: true });
    const item = (await f().reads(a, id)).data.items[0]!;
    expect(item).toEqual({
      restId: b.restaurantId,
      name: expect.any(String),
      times: 1,
      lastDay: DAY,
      reaction: null,
    });
    expect(item).not.toHaveProperty('lastAt');
  });

  it('I2：打开详情不再锁帖子行：别的事务锁着帖子时，读过的店再次打开不会被卡住', async () => {
    const a = await newRestaurant(t, { verified: true });
    const b = await newRestaurant(t, { shardId: a.shardId });
    const id = (await f().createPost(a, { category: 'chat', title: 't', content: 'c' })).data.id;
    await f().detail(b, id);
    let release!: () => void;
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const held = t.db.transaction().execute(async (tx) => {
      await tx.selectFrom('forum_post').select('id').where('id', '=', id).forUpdate().execute();
      locked();
      await new Promise<void>((r) => (release = r));
    });
    await isLocked;
    const r = await Promise.race([
      f()
        .detail(b, id)
        .then(() => 'done'),
      new Promise((res) => setTimeout(() => res('blocked'), 1500)),
    ]);
    release();
    await held;
    expect(r).toBe('done');
    const row = await t.db
      .selectFrom('forum_read')
      .select('times')
      .where('post_id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.times).toBe(2);
  });
});
