import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameTime } from '@dt/shared';
import { resolveShardSettings } from '@dt/config';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { createShard } from '../../../test/fixtures';
import { scriptedWriter, type Writer } from '../../infra/writer';
import { postNews } from '../news/news';
import { dailyJobs, generateDaily, KEEP_DAYS } from './generate';

const config = testConfig();
const DAY = '2026-10-07';
const TODAY = addDays(DAY, 1);
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 一个区服，DAY 那天有一条升星新闻；返回区服号和店号 */
async function shardWithNews() {
  const shardId = await createShard(t.db);
  const a = await newRestaurant(t, { shardId });
  await postNews(
    t.db,
    { shardId, type: 'star.up', restId: a.restaurantId, params: { star: 4 } },
    gameTime(DAY, 10),
  );
  return { shardId, r: `{r:${a.restaurantId}}` };
}

const zhReply = (r: string) =>
  JSON.stringify({ title: '小镇又热闹了', body: `${r} 升到了 4 星, 可喜可贺。\n\n${'镇'.repeat(90)}` });
const enReply = (r: string) =>
  JSON.stringify({ title: 'Busy day in town', body: `${r} reached 4 stars. ${'Town '.repeat(20)}` });

const row = (shardId: number) =>
  t.db
    .selectFrom('town_daily')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('day', '=', DAY)
    .executeTakeFirst();

const o = { maxEvents: 30, autoPublish: false };

describe('小镇日报：生成一天', () => {
  it('草稿模式：两次调用，三种语言齐全，记 token，状态 draft', async () => {
    const { shardId, r } = await shardWithNews();
    const w = scriptedWriter([zhReply(r), enReply(r)]);
    expect(await generateDaily(t.game.deps, w, shardId, DAY, o)).toEqual({
      status: 'draft',
      tokensIn: 200,
      tokensOut: 100,
    });
    expect(w.calls).toHaveLength(2);
    expect(w.calls[0]!.user).toContain(r);
    expect(w.calls[1]!.user).toContain('小镇又热闹了');
    const x = (await row(shardId))!;
    expect(x).toMatchObject({ status: 'draft', tokens_in: 200, tokens_out: 100, attempts: 1, error: null });
    expect(x.published_at).toBeNull();
    expect(x.generated_at).not.toBeNull();
    expect(x.model).toBe('scripted');
    expect(x.content).toMatchObject({
      'zh-CN': { title: '小镇又热闹了' },
      en: { title: 'Busy day in town' },
      'zh-TW': { title: '小鎮又熱鬧了' },
    });
  });

  it('自动发布：直接 published', async () => {
    const { shardId, r } = await shardWithNews();
    const w = scriptedWriter([zhReply(r), enReply(r)]);
    await generateDaily(t.game.deps, w, shardId, DAY, { ...o, autoPublish: true });
    const x = (await row(shardId))!;
    expect(x.status).toBe('published');
    expect(x.published_at).not.toBeNull();
  });

  it('AI 回得不合格：记下原因和 token、行停在 pending，抛错；再来一次成功', async () => {
    const { shardId, r } = await shardWithNews();
    await expect(
      generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply('{r:999}')]), shardId, DAY, o),
    ).rejects.toThrow('tokens');
    let x = (await row(shardId))!;
    expect(x).toMatchObject({ status: 'pending', attempts: 1, tokens_in: 200, content: null });
    expect(x.error).toContain('tokens');
    await generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply(r)]), shardId, DAY, o);
    x = (await row(shardId))!;
    expect(x).toMatchObject({ status: 'draft', attempts: 2, tokens_in: 400, error: null });
  });

  it('已有草稿时不再生成；重新生成（force）可以，次数 +1；已发布的不能重新生成', async () => {
    const { shardId, r } = await shardWithNews();
    await generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply(r)]), shardId, DAY, o);
    const idle = scriptedWriter([]);
    expect((await generateDaily(t.game.deps, idle, shardId, DAY, o)).status).toBe('draft');
    expect(idle.calls).toHaveLength(0);
    await generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply(r)]), shardId, DAY, {
      ...o,
      force: true,
    });
    expect((await row(shardId))!.regenerations).toBe(1);
    await t.db
      .updateTable('town_daily')
      .set({ status: 'published' })
      .where('shard_id', '=', shardId)
      .execute();
    await expect(
      generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply(r)]), shardId, DAY, {
        ...o,
        force: true,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('小镇日报：周期任务', () => {
  const settings = resolveShardSettings(config, { features: { daily: true } });
  const job = (w: Writer | undefined) => dailyJobs(t.game.deps, w)[0]!;
  const ctx = (shardId: number) => ({
    shardId,
    period: `daily-${TODAY}`,
    now: gameTime(TODAY, 0, 10),
    settings,
    log: { error: () => undefined },
  });

  it('游戏时间 00:10 以后才跑，周期键是当天；开了重试', () => {
    const j = job(undefined);
    expect(j.feature).toBe('daily');
    expect(j.retry).toBe(true);
    expect(j.period(gameTime(TODAY, 0, 9), settings)).toBeNull();
    expect(j.period(gameTime(TODAY, 0, 10), settings)).toBe(`daily-${TODAY}`);
    expect(j.period(gameTime(TODAY, 23, 0), settings)).toBe(`daily-${TODAY}`);
  });

  it('写的是前一天；没配密钥时只存素材', async () => {
    const { shardId } = await shardWithNews();
    expect(await job(undefined).run(ctx(shardId))).toMatchObject({ day: DAY, noKey: true });
    const x = (await row(shardId))!;
    expect(x.status).toBe('pending');
    expect(JSON.stringify(x.facts)).toContain('升到了 4 星');
  });

  it('有密钥时生成；已经生成过就跳过；清掉 60 天前的', async () => {
    const { shardId, r } = await shardWithNews();
    const old = addDays(DAY, -KEEP_DAYS);
    await t.db
      .insertInto('town_daily')
      .values({ shard_id: shardId, day: old, status: 'draft', facts: '{}' })
      .execute();
    expect(await job(scriptedWriter([zhReply(r), enReply(r)])).run(ctx(shardId))).toMatchObject({
      day: DAY,
      status: 'draft',
    });
    expect(await job(scriptedWriter([])).run(ctx(shardId))).toMatchObject({ skipped: 'draft' });
    const days = await t.db.selectFrom('town_daily').select('day').where('shard_id', '=', shardId).execute();
    expect(days.map((x) => x.day)).toEqual([DAY]);
  });
});
