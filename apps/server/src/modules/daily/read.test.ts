import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { createShard } from '../../../test/fixtures';
import { headlines, postNews } from '../news/news';
import type { DailyFacts } from './facts';

const TODAY = '2026-10-09';
const Y = addDays(TODAY, -1);
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  t.clock.set(gameTime(TODAY, 9));
});
afterAll(() => t.close());

const article = (title: string, body: string) => ({
  'zh-CN': { title, body },
  en: { title: `${title}-en`, body },
  'zh-TW': { title: `${title}-tw`, body },
});

async function shard(daily = true) {
  const shardId = await createShard(t.db);
  await t.db
    .insertInto('shard_config')
    .values({ shard_id: shardId, override: JSON.stringify({ features: { daily } }) })
    .execute();
  t.game.shards.invalidate(shardId);
  const a = await newRestaurant(t, { shardId });
  return { shardId, a };
}

async function put(
  shardId: number,
  day: string,
  status: 'pending' | 'draft' | 'published' | 'hidden',
  o: { facts?: Partial<DailyFacts>; content?: unknown } = {},
) {
  await t.db
    .insertInto('town_daily')
    .values({
      shard_id: shardId,
      day,
      status,
      facts: JSON.stringify({ events: [], ...o.facts }),
      content: o.content === undefined ? null : JSON.stringify(o.content),
    })
    .execute();
}

describe('小镇日报：玩家看', () => {
  it('不带日期：取最近 7 天里最新一份已发布的；记号里的店给现在的名字，关了的店为 null', async () => {
    const { shardId, a } = await shard();
    await put(shardId, Y, 'draft', { content: article('草稿', 'x') });
    await put(shardId, addDays(Y, -1), 'published', {
      content: article('前天', `{r:${a.restaurantId}} 和 {r:99999999}`),
    });
    await put(shardId, addDays(Y, -7), 'published', { content: article('太早', 'x') });
    const r = await t.game.town.daily(a, undefined);
    expect(r.day).toBe(addDays(Y, -1));
    expect(r.days).toEqual([Y, addDays(Y, -1)]);
    expect(r.article!['zh-CN'].title).toBe('前天');
    expect(r.article!.en.title).toBe('前天-en');
    expect(r.rests).toEqual({
      [a.restaurantId]: (
        await t.db
          .selectFrom('restaurant')
          .select('name')
          .where('id', '=', a.restaurantId)
          .executeTakeFirstOrThrow()
      ).name,
      99999999: null,
    });
    expect(r.fallback).toEqual([]);
  });

  it('记号里的店只认本区服的：别的区服的店当作不存在（backlog）', async () => {
    const { shardId, a } = await shard();
    const other = await shard();
    await put(shardId, Y, 'published', {
      content: article('跨区', `{r:${a.restaurantId}} 和 {r:${other.a.restaurantId}}`),
    });
    const r = await t.game.town.daily(a, Y);
    expect(r.rests[a.restaurantId]).toBeTruthy();
    expect(r.rests[other.a.restaurantId]).toBeNull();
  });

  it('没发布（草稿、撤下、还没生成）的那天：没有文章，给“今日要闻”，按素材的顺序', async () => {
    const { shardId, a } = await shard();
    const at = gameTime(Y, 10);
    await postNews(t.db, { shardId, type: 'star.up', restId: a.restaurantId, params: { star: 3 } }, at);
    await postNews(t.db, { shardId, type: 'kuji.big', restId: a.restaurantId, params: { tier: 'A' } }, at);
    const ids = (
      await t.db.selectFrom('news').select('id').where('shard_id', '=', shardId).orderBy('id').execute()
    ).map((x) => Number(x.id));
    await put(shardId, Y, 'hidden', {
      content: article('撤下的', 'x'),
      facts: {
        events: [
          { kind: 'k', text: 't', newsId: ids[1]! },
          { kind: 'k', text: 't', newsId: ids[0]! },
        ],
      },
    });
    const r = await t.game.town.daily(a, Y);
    expect(r.article).toBeNull();
    expect(r.fallback.map((n) => n.type)).toEqual(['kuji.big', 'star.up']);
    expect(r.fallback[0]!.restId).toBe(a.restaurantId);
  });

  it('只能看最近 7 天；没有行的那天返回空；区服没开日报报错', async () => {
    const { shardId, a } = await shard();
    await expect(t.game.town.daily(a, addDays(Y, -7))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(t.game.town.daily(a, TODAY)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const empty = await t.game.town.daily(a, addDays(Y, -6));
    expect(empty).toMatchObject({ day: addDays(Y, -6), days: [], article: null, fallback: [] });
    void shardId;
    const off = await shard(false);
    await expect(t.game.town.daily(off.a, undefined)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('首页头条：昨天的已发布才带日报标题；没开日报不带', async () => {
    const { shardId, a } = await shard();
    expect((await headlines(t.db, shardId, { daily: true, now: t.clock.now })).daily).toBeNull();
    await put(shardId, Y, 'published', { content: article(`{r:${a.restaurantId}} 的昨天`, 'x') });
    const name = (
      await t.db
        .selectFrom('restaurant')
        .select('name')
        .where('id', '=', a.restaurantId)
        .executeTakeFirstOrThrow()
    ).name;
    expect((await headlines(t.db, shardId, { daily: true, now: t.clock.now })).daily).toEqual({
      day: Y,
      title: {
        'zh-CN': `{r:${a.restaurantId}} 的昨天`,
        en: `{r:${a.restaurantId}} 的昨天-en`,
        'zh-TW': `{r:${a.restaurantId}} 的昨天-tw`,
      },
      // 标题里的店也给现在的名字
      rests: { [a.restaurantId]: name },
    });
    expect((await headlines(t.db, shardId)).daily).toBeNull();
  });

  it('首页头条：英文标题里有、简中标题里没有的店也给名字（终审 I4）', async () => {
    const { shardId, a } = await shard();
    const r = `{r:${a.restaurantId}}`;
    await put(shardId, Y, 'published', {
      content: {
        'zh-CN': { title: '大赏出炉', body: `${r} ${r}` },
        en: { title: `${r} wins big`, body: r },
        'zh-TW': { title: '大賞出爐', body: `${r} ${r}` },
      },
    });
    const head = (await headlines(t.db, shardId, { daily: true, now: t.clock.now })).daily!;
    expect(head.rests[a.restaurantId]).toBeTruthy();
  });
});
