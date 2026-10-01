import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ReportTarget } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';

describe('后台举报处理（HTTP，设计 §3.3）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  let shardId: number;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
    shardId = await createShard(ctx.deps.db);
  });
  afterAll(() => ctx.close());

  const db = () => ctx.deps.db;
  async function shop(notice = '') {
    const accountId = await createAccountRow(db());
    const restId = await createRestaurantFull(db(), shardId, accountId, { patch: { notice } });
    return { accountId, restId };
  }
  /** 直接写库准备一个待处理的案子和两个举报人（玩家举报的流程在 report.test.ts 测过） */
  async function seed(
    type: ReportTarget,
    targetId: number,
    bad: { accountId: number; restId: number },
    text: string,
  ) {
    const c = await db()
      .insertInto('report_case')
      .values({
        shard_id: shardId,
        target_type: type,
        target_id: targetId,
        target_rest_id: bad.restId,
        target_account_id: bad.accountId,
        snapshot: text,
        reporter_count: 2,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const a = await shop();
    const b = await shop();
    for (const r of [a, b])
      await db()
        .insertInto('report_entry')
        .values({ case_id: c.id, reporter_account_id: r.accountId, reporter_rest_id: r.restId, reason: 'ad' })
        .execute();
    return { caseId: c.id, a, b };
  }
  async function noticeCase(notice = '加我微信') {
    const bad = await shop(notice);
    return { bad, ...(await seed('notice', bad.restId, bad, notice)) };
  }
  const post = (cookie: string, path: string, body: unknown) =>
    call(ctx.app, 'POST', `/api/v1/admin${path}`, { cookie, body });
  const mails = (restId: number) =>
    db()
      .selectFrom('mail')
      .select(['title', 'body'])
      .where('rest_id', '=', restId)
      .where('source', '=', 'report')
      .orderBy('id')
      .execute();
  const caseRow = (id: number) =>
    db().selectFrom('report_case').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  it('列表和详情：带举报人、当前内容、以前被处理过几次', async () => {
    const { caseId } = await noticeCase();
    const l = await call(ctx.app, 'GET', `/api/v1/admin/reports?shardId=${shardId}&status=open`, {
      cookie: mod.cookie,
    });
    expect(l.json.data.find((c: { id: number }) => c.id === caseId)).toMatchObject({
      reporterCount: 2,
      snapshot: '加我微信',
      status: 'open',
    });
    const d = await call(ctx.app, 'GET', `/api/v1/admin/reports/${caseId}`, { cookie: mod.cookie });
    expect(d.json.data).toMatchObject({ current: '加我微信', priorCases: 0 });
    expect(d.json.data.entries).toHaveLength(2);
  });

  it('处理公告：清空、封 7 天、邮件给举报人和被处理人、审计；不能重复处理', async () => {
    const { caseId, bad, a } = await noticeCase();
    const r = await post(mod.cookie, `/reports/${caseId}/resolve`, { note: '发广告', banDays: 7 });
    expect(r.status).toBe(200);
    const rest = await db()
      .selectFrom('restaurant')
      .select('notice')
      .where('id', '=', bad.restId)
      .executeTakeFirstOrThrow();
    expect(rest.notice).toBe('');
    const acc = await db()
      .selectFrom('account')
      .select(['banned_at', 'banned_until'])
      .where('id', '=', bad.accountId)
      .executeTakeFirstOrThrow();
    expect(acc.banned_at).not.toBeNull();
    expect(acc.banned_until!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect((await mails(a.restId)).map((m) => m.title)).toEqual(['举报结果']);
    const notice = await mails(bad.restId);
    expect(notice[0]!.title).toBe('违规处理通知');
    expect(notice[0]!.body).toContain('发广告');
    expect(notice[0]!.body).toContain('7 天');
    expect(await caseRow(caseId)).toMatchObject({
      status: 'resolved',
      action: 'clear',
      ban_days: 7,
      note: '发广告',
    });
    const audit = await db()
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', `report:${caseId}`)
      .execute();
    expect(audit.map((x) => x.action)).toEqual(['report.resolve']);
    const again = await post(mod.cookie, `/reports/${caseId}/resolve`, { note: '再来' });
    expect(again.json.params.reason).toBe('report_closed');
  });

  it('协管不能永封；管理员能（Review Focus 4）', async () => {
    const { caseId, bad } = await noticeCase();
    expect((await post(mod.cookie, `/reports/${caseId}/resolve`, { note: 'x', banDays: 0 })).status).toBe(
      403,
    );
    expect((await caseRow(caseId)).status).toBe('open');
    expect((await post(admin.cookie, `/reports/${caseId}/resolve`, { note: 'x', banDays: 0 })).status).toBe(
      200,
    );
    const acc = await db()
      .selectFrom('account')
      .select(['banned_at', 'banned_until'])
      .where('id', '=', bad.accountId)
      .executeTakeFirstOrThrow();
    expect(acc.banned_at).not.toBeNull();
    expect(acc.banned_until).toBeNull();
  });

  it('内容已经被店主改掉：照样结案，action 为 none（Review Focus 2）', async () => {
    const { caseId, bad } = await noticeCase();
    await db().updateTable('restaurant').set({ notice: '' }).where('id', '=', bad.restId).execute();
    expect((await post(mod.cookie, `/reports/${caseId}/resolve`, { note: '已自行删除' })).status).toBe(200);
    expect(await caseRow(caseId)).toMatchObject({ status: 'resolved', action: 'none' });
  });

  it('驳回：举报人收到"未违规"，内容不动，审计', async () => {
    const { caseId, bad, a } = await noticeCase('正常公告');
    expect((await post(mod.cookie, `/reports/${caseId}/reject`, { note: '没问题' })).status).toBe(200);
    expect((await mails(a.restId))[0]!.body).toContain('未违规');
    expect(await mails(bad.restId)).toEqual([]);
    const rest = await db()
      .selectFrom('restaurant')
      .select('notice')
      .where('id', '=', bad.restId)
      .executeTakeFirstOrThrow();
    expect(rest.notice).toBe('正常公告');
    expect(await caseRow(caseId)).toMatchObject({ status: 'rejected', action: 'none', note: '没问题' });
  });

  it('其他类型：删帖（连新闻）、删回复、撤喇叭、改店名', async () => {
    const bad = await shop();
    const p = await db()
      .insertInto('forum_post')
      .values({
        shard_id: shardId,
        rest_id: bad.restId,
        category: 'chat',
        title: '标题',
        content: '正文',
        created_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const reply = await db()
      .insertInto('forum_reply')
      .values({ post_id: p.id, rest_id: bad.restId, floor: 1, content: '骂人', created_at: new Date() })
      .returning('id')
      .executeTakeFirstOrThrow();
    const news = await db()
      .insertInto('news')
      .values({
        shard_id: shardId,
        type: 'town.broadcast',
        rest_id: bad.restId,
        params: JSON.stringify({ text: '刷屏' }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const r1 = await seed('reply', reply.id, bad, '骂人');
    expect((await post(mod.cookie, `/reports/${r1.caseId}/resolve`, { note: '辱骂' })).status).toBe(200);
    const rr = await db()
      .selectFrom('forum_reply')
      .select('deleted_at')
      .where('id', '=', reply.id)
      .executeTakeFirstOrThrow();
    expect(rr.deleted_at).not.toBeNull();

    const r2 = await seed('post', p.id, bad, '标题\n正文');
    expect((await post(mod.cookie, `/reports/${r2.caseId}/resolve`, { note: '广告' })).status).toBe(200);
    const pp = await db()
      .selectFrom('forum_post')
      .select('deleted_at')
      .where('id', '=', p.id)
      .executeTakeFirstOrThrow();
    expect(pp.deleted_at).not.toBeNull();

    const r3 = await seed('broadcast', news.id, bad, '刷屏');
    expect((await post(mod.cookie, `/reports/${r3.caseId}/resolve`, { note: '刷屏' })).status).toBe(200);
    expect(
      await db().selectFrom('news').select('id').where('id', '=', news.id).executeTakeFirst(),
    ).toBeUndefined();

    const name = await db()
      .selectFrom('restaurant')
      .select('name')
      .where('id', '=', bad.restId)
      .executeTakeFirstOrThrow();
    const r4 = await seed('rest_name', bad.restId, bad, name.name);
    expect((await post(mod.cookie, `/reports/${r4.caseId}/resolve`, { note: '店名不雅' })).status).toBe(200);
    const after = await db()
      .selectFrom('restaurant')
      .select('name')
      .where('id', '=', bad.restId)
      .executeTakeFirstOrThrow();
    expect(after.name).toBe(`餐厅${bad.restId}`);
    const log = await db()
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', bad.restId)
      .where('type', '=', 'admin.rename')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ from: name.name, to: `餐厅${bad.restId}`, reason: '店名不雅' });
    expect((await caseRow(r1.caseId)).action).toBe('delete');
    expect((await caseRow(r4.caseId)).action).toBe('rename');
  });
});
