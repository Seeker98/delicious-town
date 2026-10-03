import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import type { RestCtx } from '../../core/deps';
import { listNews } from '../news/news';

const DAY = '2026-09-30';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const ready = (patch = {}, goods: Record<number, number> = { 315: 2 }) =>
  newRestaurant(t, { patch: { star_level: 1, ...patch }, goods, verified: true });
const send = (ctx: RestCtx, text: string) => t.game.town.broadcast(ctx, { text });

describe('广播（设计文档 §3.2）', () => {
  it('成功：去掉首尾空白，扣 1 个喇叭，写广播新闻，计入支线"在小镇广播一次"', async () => {
    const a = await ready();
    expect((await send(a, '  大家好  ')).data).toEqual({ text: '大家好' });
    expect(await goodsNum(t, a.restaurantId, 315)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1 });
    expect(n).toMatchObject({ type: 'town.broadcast', restId: a.restaurantId, params: { text: '大家好' } });
    await showQuest(t, a.restaurantId, 2123);
    const side = questIn(await t.game.task.tasks(a), 2123);
    expect(side).toMatchObject({ progress: 1, done: true });
  });

  it('64 个字可以，65 个字或全是空白不行', async () => {
    const a = await ready({}, { 315: 5 });
    await expect(send(a, '字'.repeat(65))).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'broadcast_text', max: 64 },
    });
    await expect(send(a, '   ')).rejects.toMatchObject({ params: { reason: 'broadcast_text' } });
    await send(a, '字'.repeat(64));
    expect(await goodsNum(t, a.restaurantId, 315)).toBe(4);
  });

  it('0 星、邮箱没验证、没有喇叭都不能广播', async () => {
    await expect(send(await ready({ star_level: 0 }), '你好')).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const unverified = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 315: 1 } });
    await expect(send(unverified, '你好')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    await expect(send(await ready({}, {}), '你好')).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 315, need: 1, have: 0 },
    });
  });

  it('30 秒冷却', async () => {
    const a = await ready();
    await send(a, '一');
    t.clock.advance(29_000);
    await expect(send(a, '二')).rejects.toMatchObject({
      code: 'COOLDOWN',
      params: { what: 'broadcast', seconds: 1 },
    });
    t.clock.advance(1_000);
    await send(a, '二');
    expect(await goodsNum(t, a.restaurantId, 315)).toBe(0);
  });
});
