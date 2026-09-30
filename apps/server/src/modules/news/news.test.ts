import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { headlines, listNews, postNews } from './news';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('新闻读取（设计文档 §3.1）', () => {
  it('只读本区服，按 id 倒序，before 翻页；带当前店名，店不存在时为 null', async () => {
    const a = await newRestaurant(t);
    const other = await newRestaurant(t);
    await postNews(t.db, {
      shardId: a.shardId,
      type: 'star.up',
      restId: a.restaurantId,
      params: { star: 1 },
    });
    await postNews(t.db, { shardId: other.shardId, type: 'star.up', restId: other.restaurantId });
    await postNews(t.db, { shardId: a.shardId, type: 'weather.change', params: { from: 1, to: 2 } });
    await postNews(t.db, { shardId: a.shardId, type: 'restaurant.open', restId: 999_999_999 });
    await t.db.updateTable('restaurant').set({ name: '改过名' }).where('id', '=', a.restaurantId).execute();

    const page = await listNews(t.db, a.shardId, { limit: 10 });
    expect(page.map((n) => n.type)).toEqual(['restaurant.open', 'weather.change', 'star.up']);
    expect(page[0]).toMatchObject({ restId: 999_999_999, restName: null });
    expect(page[2]).toMatchObject({ restId: a.restaurantId, restName: '改过名', params: { star: 1 } });
    expect(typeof page[2]!.createdAt).toBe('string');

    const next = await listNews(t.db, a.shardId, { limit: 10, before: page[1]!.id });
    expect(next.map((n) => n.type)).toEqual(['star.up']);
  });

  it('头条：最新 3 条非广播 + 最新 1 条广播', async () => {
    const a = await newRestaurant(t);
    const s = a.shardId;
    await postNews(t.db, {
      shardId: s,
      type: 'town.broadcast',
      restId: a.restaurantId,
      params: { text: '旧' },
    });
    for (const star of [1, 2, 3, 4]) await postNews(t.db, { shardId: s, type: 'star.up', params: { star } });
    await postNews(t.db, {
      shardId: s,
      type: 'town.broadcast',
      restId: a.restaurantId,
      params: { text: '新' },
    });
    const h = await headlines(t.db, s);
    expect(h.news.map((n) => n.params.star)).toEqual([4, 3, 2]);
    expect(h.broadcast).toMatchObject({ type: 'town.broadcast', params: { text: '新' } });
    expect((await headlines(t.db, (await newRestaurant(t)).shardId)).broadcast).toBeNull();
  });

  it('小镇新闻接口：每页 pageSize 条，hasMore', async () => {
    const a = await newRestaurant(t);
    for (let i = 0; i < 52; i++)
      await postNews(t.db, { shardId: a.shardId, type: 'star.up', params: { star: i } });
    const p1 = await t.game.town.news(a, {});
    expect(p1.items).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    const p2 = await t.game.town.news(a, { before: p1.items[49]!.id });
    expect(p2.items).toHaveLength(2);
    expect(p2.hasMore).toBe(false);
  });

  it('首页概览带头条', async () => {
    const a = await newRestaurant(t);
    await postNews(t.db, {
      shardId: a.shardId,
      type: 'star.up',
      restId: a.restaurantId,
      params: { star: 1 },
    });
    const o = await t.game.restaurant.overview(a.restaurantId);
    expect(o.headlines.news.map((n) => n.type)).toContain('star.up');
    expect(o.headlines.broadcast).toBeNull();
  });
});
