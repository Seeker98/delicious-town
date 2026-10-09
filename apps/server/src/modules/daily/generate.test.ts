import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameTime } from '@dt/shared';
import { resolveShardSettings } from '@dt/config';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { createShard } from '../../../test/fixtures';
import { scriptedWriter, WriterError, type Writer } from '../../infra/writer';
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
    // 简中已经合格：再来一次只调翻译，不重写、不重付（backlog 1010）
    const again = scriptedWriter([enReply(r)]);
    await generateDaily(t.game.deps, again, shardId, DAY, o);
    expect(again.calls).toHaveLength(1);
    x = (await row(shardId))!;
    expect(x).toMatchObject({ status: 'draft', attempts: 2, tokens_in: 300, error: null });
    expect((x.content as { 'zh-CN': { title: string } })['zh-CN'].title).toBe('小镇又热闹了');
  });

  it('简中不合格时下次从头写（backlog 1010）', async () => {
    const { shardId, r } = await shardWithNews();
    await expect(
      generateDaily(t.game.deps, scriptedWriter([zhReply('{r:999}')]), shardId, DAY, o),
    ).rejects.toThrow();
    const again = scriptedWriter([zhReply(r), enReply(r)]);
    await generateDaily(t.game.deps, again, shardId, DAY, o);
    expect(again.calls).toHaveLength(2);
  });

  it('写稿器回空内容时那次的 token 也记上（backlog 1010）', async () => {
    const { shardId } = await shardWithNews();
    const empty: Writer = {
      async chat() {
        throw new WriterError('writer empty reply', { tokensIn: 70, tokensOut: 3, model: 'm2' });
      },
    };
    await expect(generateDaily(t.game.deps, empty, shardId, DAY, o)).rejects.toThrow('empty');
    expect((await row(shardId))!).toMatchObject({ tokens_in: 70, tokens_out: 3, model: 'm2', attempts: 1 });
  });

  it('已有草稿时重新生成失败：草稿那一行不记过时的错误（backlog 1010）', async () => {
    const { shardId, r } = await shardWithNews();
    await generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply(r)]), shardId, DAY, o);
    await expect(
      generateDaily(t.game.deps, scriptedWriter([new Error('boom')]), shardId, DAY, { ...o, force: true }),
    ).rejects.toThrow('boom');
    expect((await row(shardId))!).toMatchObject({ status: 'draft', error: null, attempts: 2 });
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
    // 重新生成的次数由后台先原子地加（backlog），这里不再加
    expect((await row(shardId))!).toMatchObject({ status: 'draft', attempts: 2, regenerations: 0 });
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

  /** 写稿器：第一次调用时先跑 during（模拟别人同时改了这一行），再照常回复 */
  function racingWriter(replies: string[], during: () => Promise<unknown>): Writer {
    const w = scriptedWriter(replies);
    let first = true;
    return {
      async chat(system, user, signal) {
        if (first) {
          first = false;
          await during();
        }
        return w.chat(system, user, signal);
      },
    };
  }

  it('重新生成期间有人手改了：不盖掉，报内容已变；花掉的 token 照样记上（backlog）', async () => {
    const { shardId, r } = await shardWithNews();
    await generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply(r)]), shardId, DAY, o);
    const edited = {
      'zh-CN': { title: '手改的', body: 'x' },
      en: { title: 'e', body: 'x' },
      'zh-TW': { title: 't', body: 'x' },
    };
    const w = racingWriter([zhReply(r), enReply(r)], () =>
      t.db
        .updateTable('town_daily')
        .set({ content: JSON.stringify(edited) })
        .where('shard_id', '=', shardId)
        .execute(),
    );
    await expect(generateDaily(t.game.deps, w, shardId, DAY, { ...o, force: true })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'daily_changed' },
    });
    const x = (await row(shardId))!;
    expect((x.content as { 'zh-CN': { title: string } })['zh-CN'].title).toBe('手改的');
    expect(x.tokens_in).toBe(400);
  });

  it('重新生成期间后台撤下了（内容没变）：不改回草稿，报内容已变（backlog 1010）', async () => {
    const { shardId, r } = await shardWithNews();
    await generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply(r)]), shardId, DAY, o);
    const w = racingWriter([zhReply(r), enReply(r)], () =>
      t.db.updateTable('town_daily').set({ status: 'hidden' }).where('shard_id', '=', shardId).execute(),
    );
    await expect(generateDaily(t.game.deps, w, shardId, DAY, { ...o, force: true })).rejects.toMatchObject({
      params: { reason: 'daily_changed' },
    });
    expect((await row(shardId))!.status).toBe('hidden');
  });

  it('周期任务写的时候后台已经发布了：不盖掉，返回现在的状态；token 照样记上（backlog）', async () => {
    const { shardId, r } = await shardWithNews();
    await t.db
      .insertInto('town_daily')
      .values({ shard_id: shardId, day: DAY, status: 'pending', facts: '{}' })
      .execute();
    const w = racingWriter([zhReply(r), enReply(r)], () =>
      t.db
        .updateTable('town_daily')
        .set({ status: 'published', content: JSON.stringify({ 'zh-CN': { title: '后台的', body: 'x' } }) })
        .where('shard_id', '=', shardId)
        .execute(),
    );
    expect((await generateDaily(t.game.deps, w, shardId, DAY, o)).status).toBe('published');
    const x = (await row(shardId))!;
    expect((x.content as { 'zh-CN': { title: string } })['zh-CN'].title).toBe('后台的');
    expect(x.tokens_in).toBe(200);
  });

  it('已有稿子的行：AI 失败时素材不换（素材和稿子对得上，backlog）', async () => {
    const { shardId, r } = await shardWithNews();
    await generateDaily(t.game.deps, scriptedWriter([zhReply(r), enReply(r)]), shardId, DAY, o);
    const before = (await row(shardId))!.facts;
    await postNews(
      t.db,
      { shardId, type: 'kuji.big', restId: Number(r.slice(3, -1)), params: { tier: 'A' } },
      gameTime(DAY, 11),
    );
    await expect(
      generateDaily(t.game.deps, scriptedWriter([new Error('boom')]), shardId, DAY, { ...o, force: true }),
    ).rejects.toThrow('boom');
    expect((await row(shardId))!.facts).toEqual(before);
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
