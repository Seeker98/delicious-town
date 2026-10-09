import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import type { Writer } from '../../infra/writer';

const art = (title: string, body: string) => ({
  'zh-CN': { title, body },
  en: { title: `${title} en`, body },
  'zh-TW': { title, body },
});
const facts = {
  day: 'x',
  shopCount: 1,
  summary: [],
  topIncome: [{ rest: '{r:2147480000}', coin: 1 }],
  events: [],
  names: {},
};

/** 假写稿器：轮流回简中、英文；calls 记次数 */
function fakeWriter(): Writer & { calls: number } {
  const replies = [
    JSON.stringify({ title: '新的', body: '镇'.repeat(90) }),
    JSON.stringify({ title: 'New', body: 'Town' }),
  ];
  const w = {
    calls: 0,
    async chat() {
      return { text: replies[w.calls++ % 2]!, tokensIn: 10, tokensOut: 5, model: 'm' };
    },
  };
  return w;
}

describe('小镇日报后台（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string; accountId: number };
  let mod: { cookie: string };
  const writer = fakeWriter();
  beforeAll(async () => {
    ctx = await createTestApp({ writer });
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
  });
  afterAll(() => ctx.close());

  const y = () => addDays(gameDay(ctx.deps.now()), -1);
  async function put(
    shardId: number,
    day: string,
    status: 'pending' | 'draft' | 'published',
    content: unknown = null,
  ) {
    await ctx.deps.db
      .insertInto('town_daily')
      .values({
        shard_id: shardId,
        day,
        status,
        facts: JSON.stringify(facts),
        content: content === null ? null : JSON.stringify(content),
        tokens_in: 3000,
        tokens_out: 900,
      })
      .execute();
  }
  const get = (url: string, cookie = admin.cookie) => call(ctx.app, 'GET', `/api/v1/admin${url}`, { cookie });
  const post = (url: string, body: unknown = {}, cookie = admin.cookie) =>
    call(ctx.app, 'POST', `/api/v1/admin${url}`, { cookie, body });
  const audits = async (target: string) =>
    (
      await ctx.deps.db
        .selectFrom('audit_log')
        .select('action')
        .where('target', '=', target)
        .orderBy('id')
        .execute()
    ).map((x) => x.action);

  it('mod 看不到（404）；admin 看列表和详情', async () => {
    const shardId = await createShard(ctx.deps.db);
    await put(shardId, y(), 'draft', art('昨天', '{r:2147480000} 开张'));
    await put(shardId, addDays(y(), -1), 'pending');
    expect((await get(`/daily?shardId=${shardId}`, mod.cookie)).status).toBe(404);
    const list = await get(`/daily?shardId=${shardId}`);
    expect(list.json.data.map((r: { day: string; title: string | null }) => [r.day, r.title])).toEqual([
      [y(), '昨天'],
      [addDays(y(), -1), null],
    ]);
    expect(list.json.data[0]).toMatchObject({ status: 'draft', tokensIn: 3000, tokensOut: 900 });
    const one = await get(`/daily/${shardId}/${y()}`);
    expect(one.json.data).toMatchObject({
      facts,
      rests: { 2147480000: null },
      content: { en: { title: '昨天 en' } },
    });
    expect((await get(`/daily/${shardId}/2020-01-01`)).status).toBe(404);
  });

  it('发布、撤下：状态变化并写审计；没有内容的不能发布', async () => {
    const shardId = await createShard(ctx.deps.db);
    await put(shardId, y(), 'draft', art('昨天', 'x'));
    expect((await post(`/daily/${shardId}/${y()}/publish`)).json.data).toMatchObject({ status: 'published' });
    const row = await ctx.deps.db
      .selectFrom('town_daily')
      .selectAll()
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow();
    expect(row.published_by).toBe(admin.accountId);
    expect((await post(`/daily/${shardId}/${y()}/hide`)).json.data.status).toBe('hidden');
    expect(await audits(`daily:${shardId}:${y()}`)).toEqual(['daily.publish', 'daily.hide']);
    await put(shardId, addDays(y(), -1), 'pending');
    expect((await post(`/daily/${shardId}/${addDays(y(), -1)}/publish`)).json.code).toBe('INVALID_STATE');
  });

  it('手改：检查记号和网址；繁中重新转；没内容的变成草稿', async () => {
    const shardId = await createShard(ctx.deps.db);
    await put(shardId, y(), 'pending');
    const bad = await post(`/daily/${shardId}/${y()}/edit`, {
      zh: { title: '日报', body: '{r:6} 开张' },
      en: { title: 'Daily', body: '{r:6} opened' },
    });
    expect(bad.json).toMatchObject({ code: 'INVALID_STATE', params: { reason: 'daily_check' } });
    const okRes = await post(`/daily/${shardId}/${y()}/edit`, {
      zh: { title: '小镇日报', body: '{r:2147480000} 开张' },
      en: { title: 'Daily', body: '{r:2147480000} opened' },
    });
    expect(okRes.json.data).toMatchObject({
      status: 'draft',
      content: { 'zh-TW': { title: '小鎮日報' }, en: { body: '{r:2147480000} opened' } },
    });
    expect(await audits(`daily:${shardId}:${y()}`)).toEqual(['daily.edit']);
  });

  it('重新生成：调用写稿器，结果是草稿；每天最多 10 次；已发布的不行', async () => {
    const shardId = await createShard(ctx.deps.db);
    await put(shardId, y(), 'draft', art('旧的', 'x'));
    writer.calls = 0;
    const r = await post(`/daily/${shardId}/${y()}/regenerate`);
    expect(writer.calls).toBe(2);
    expect(r.json.data).toMatchObject({
      status: 'draft',
      regenerations: 1,
      content: { 'zh-CN': { title: '新的' } },
    });
    await ctx.deps.db
      .updateTable('town_daily')
      .set({ regenerations: 10 })
      .where('shard_id', '=', shardId)
      .execute();
    expect((await post(`/daily/${shardId}/${y()}/regenerate`)).json.code).toBe('LIMIT_REACHED');
    await ctx.deps.db
      .updateTable('town_daily')
      .set({ regenerations: 0, status: 'published' })
      .where('shard_id', '=', shardId)
      .execute();
    expect((await post(`/daily/${shardId}/${y()}/regenerate`)).json.code).toBe('INVALID_STATE');
    expect(await audits(`daily:${shardId}:${y()}`)).toEqual(['daily.regenerate']);
  });

  it('不存在的区服：重新生成报区服不存在，不是 500（backlog 1010）', async () => {
    const r = await post(`/daily/99999999/${y()}/regenerate`);
    expect(r.status).toBe(404);
    expect(r.json.code).toBe('SHARD_NOT_FOUND');
  });

  it('重新生成只限最近 28 天（更早的新闻已经删了，backlog）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const old = addDays(y(), -28);
    await put(shardId, old, 'draft', art('很早', 'x'));
    expect((await post(`/daily/${shardId}/${old}/regenerate`)).json).toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'daily_too_old' },
    });
  });

  it('同时点两次、只剩 1 次额度：只有一次真的调 AI（次数先原子地加，backlog）', async () => {
    const shardId = await createShard(ctx.deps.db);
    await put(shardId, y(), 'draft', art('旧的', 'x'));
    await ctx.deps.db
      .updateTable('town_daily')
      .set({ regenerations: 9 })
      .where('shard_id', '=', shardId)
      .execute();
    writer.calls = 0;
    const codes = (
      await Promise.all([
        post(`/daily/${shardId}/${y()}/regenerate`),
        post(`/daily/${shardId}/${y()}/regenerate`),
      ])
    ).map((x) => x.json.code ?? 'ok');
    expect(codes.sort()).toEqual(['LIMIT_REACHED', 'ok']);
    expect(writer.calls).toBe(2);
  });
});

describe('小镇日报后台：没配密钥', () => {
  it('重新生成报错', async () => {
    const ctx = await createTestApp();
    const admin = await userWithRole(ctx, 'admin');
    const shardId = await createShard(ctx.deps.db);
    const day = addDays(gameDay(ctx.deps.now()), -1);
    const r = await call(ctx.app, 'POST', `/api/v1/admin/daily/${shardId}/${day}/regenerate`, {
      cookie: admin.cookie,
      body: {},
    });
    expect(r.json).toMatchObject({ code: 'INVALID_STATE', params: { reason: 'daily_no_key' } });
    await ctx.close();
  });
});
