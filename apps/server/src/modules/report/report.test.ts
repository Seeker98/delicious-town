import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const report = (ctx: Parameters<TestGame['game']['report']['report']>[0], b: Record<string, unknown>) =>
  t.game.report.report(ctx, { reason: 'ad', ...b } as never);
const caseOf = (type: string, id: number) =>
  t.db
    .selectFrom('report_case')
    .selectAll()
    .where('target_type', '=', type as 'notice')
    .where('target_id', '=', id)
    .orderBy('id', 'desc')
    .execute();

describe('玩家举报（设计 §3.2）', () => {
  it('举报公告：开案并存快照；另一个人举报挂在同一案子；同一人重复报 report_dup', async () => {
    const bad = await newRestaurant(t, { patch: { notice: '加我微信' } });
    const a = await newRestaurant(t, { shardId: bad.shardId });
    const b = await newRestaurant(t, { shardId: bad.shardId });
    await report(a, { targetType: 'notice', targetId: bad.restaurantId, detail: '广告' });
    await report(b, { targetType: 'notice', targetId: bad.restaurantId });
    await expect(report(a, { targetType: 'notice', targetId: bad.restaurantId })).rejects.toMatchObject({
      params: { reason: 'report_dup' },
    });
    const [c] = await caseOf('notice', bad.restaurantId);
    expect(c).toMatchObject({
      status: 'open',
      reporter_count: 2,
      snapshot: '加我微信',
      target_account_id: bad.accountId,
    });
  });

  it('不能举报自己；空公告报 report_empty；不存在报 NOT_FOUND；别的区服的内容报 NOT_FOUND', async () => {
    const me = await newRestaurant(t, { patch: { notice: '我的公告' } });
    const empty = await newRestaurant(t, { shardId: me.shardId, patch: { notice: '' } });
    const far = await newRestaurant(t, { patch: { notice: '别区' } });
    await expect(report(me, { targetType: 'notice', targetId: me.restaurantId })).rejects.toMatchObject({
      params: { reason: 'report_self' },
    });
    await expect(report(me, { targetType: 'notice', targetId: empty.restaurantId })).rejects.toMatchObject({
      params: { reason: 'report_empty' },
    });
    await expect(report(me, { targetType: 'post', targetId: 99999999 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(report(me, { targetType: 'notice', targetId: far.restaurantId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('每天最多 10 次', async () => {
    const me = await newRestaurant(t);
    for (let i = 0; i < 10; i++) {
      const x = await newRestaurant(t, { shardId: me.shardId });
      await report(me, { targetType: 'rest_name', targetId: x.restaurantId });
    }
    const x = await newRestaurant(t, { shardId: me.shardId });
    await expect(report(me, { targetType: 'rest_name', targetId: x.restaurantId })).rejects.toMatchObject({
      params: { reason: 'report_daily' },
    });
  });

  it('并发：两人同时举报同一条没被举报过的内容，只开一个案子（Review Focus 1）', async () => {
    const bad = await newRestaurant(t, { patch: { notice: '刷单' } });
    const a = await newRestaurant(t, { shardId: bad.shardId });
    const b = await newRestaurant(t, { shardId: bad.shardId });
    await Promise.all([
      report(a, { targetType: 'notice', targetId: bad.restaurantId }),
      report(b, { targetType: 'notice', targetId: bad.restaurantId }),
    ]);
    const cases = await caseOf('notice', bad.restaurantId);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.reporter_count).toBe(2);
  });

  it('驳回后内容没改：只记数不开新案；内容改了：开新案（Review Focus 5）', async () => {
    const bad = await newRestaurant(t, { patch: { notice: '正常内容' } });
    const a = await newRestaurant(t, { shardId: bad.shardId });
    const b = await newRestaurant(t, { shardId: bad.shardId });
    const c = await newRestaurant(t, { shardId: bad.shardId });
    await report(a, { targetType: 'notice', targetId: bad.restaurantId });
    await t.db
      .updateTable('report_case')
      .set({ status: 'rejected' })
      .where('target_id', '=', bad.restaurantId)
      .execute();
    await report(b, { targetType: 'notice', targetId: bad.restaurantId });
    let cases = await caseOf('notice', bad.restaurantId);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ status: 'rejected', reporter_count: 2 });
    await t.db
      .updateTable('restaurant')
      .set({ notice: '改成广告了' })
      .where('id', '=', bad.restaurantId)
      .execute();
    await report(c, { targetType: 'notice', targetId: bad.restaurantId });
    cases = await caseOf('notice', bad.restaurantId);
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({ status: 'open', snapshot: '改成广告了', reporter_count: 1 });
  });

  it('驳回 → 改过并被处理 → 又改回原样：再被举报开新案，不挂到最早那个驳回的案子上（backlog 6B-1）', async () => {
    const bad = await newRestaurant(t, { patch: { notice: '原样内容' } });
    const [a, b, c] = [
      await newRestaurant(t, { shardId: bad.shardId }),
      await newRestaurant(t, { shardId: bad.shardId }),
      await newRestaurant(t, { shardId: bad.shardId }),
    ];
    const setNotice = (notice: string) =>
      t.db.updateTable('restaurant').set({ notice }).where('id', '=', bad.restaurantId).execute();
    const close = (status: 'rejected' | 'resolved') =>
      t.db
        .updateTable('report_case')
        .set({ status })
        .where('target_id', '=', bad.restaurantId)
        .where('status', '=', 'open')
        .execute();
    await report(a, { targetType: 'notice', targetId: bad.restaurantId });
    await close('rejected');
    await setNotice('改成广告');
    await report(b, { targetType: 'notice', targetId: bad.restaurantId });
    await close('resolved');
    await setNotice('原样内容');
    await report(c, { targetType: 'notice', targetId: bad.restaurantId });
    const cases = await caseOf('notice', bad.restaurantId);
    expect(cases).toHaveLength(3);
    expect(cases[0]).toMatchObject({ status: 'open', snapshot: '原样内容', reporter_count: 1 });
  });

  it('举报和处理同时发生：处理提交后举报看到内容已删除，报 NOT_FOUND，不开空案（backlog 6B-1）', async () => {
    const bad = await newRestaurant(t);
    const a = await newRestaurant(t, { shardId: bad.shardId });
    const b = await newRestaurant(t, { shardId: bad.shardId });
    const news = await t.db
      .insertInto('news')
      .values({
        shard_id: bad.shardId,
        type: 'town.broadcast',
        rest_id: bad.restaurantId,
        params: JSON.stringify({ text: '刷屏' }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const id = Number(news.id);
    await report(a, { targetType: 'broadcast', targetId: id });
    let late: Promise<unknown> | null = null;
    // 模拟后台处理：结案、撤下喇叭，提交前另一个人正好来举报
    await t.db.transaction().execute(async (tx) => {
      await tx.updateTable('report_case').set({ status: 'resolved' }).where('target_id', '=', id).execute();
      await tx.deleteFrom('news').where('id', '=', id).execute();
      late = report(b, { targetType: 'broadcast', targetId: id }).catch((e: unknown) => e);
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(await late).toMatchObject({ code: 'NOT_FOUND' });
    const cases = await caseOf('broadcast', id);
    expect(cases.map((c) => c.status)).toEqual(['resolved']);
  });

  it('关掉 report 开关时 FEATURE_DISABLED', async () => {
    const bad = await newRestaurant(t, { patch: { notice: 'x' } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: bad.shardId, override: JSON.stringify({ features: { report: false } }) })
      .execute();
    t.game.shards.invalidate(bad.shardId);
    const a = await newRestaurant(t, { shardId: bad.shardId });
    await expect(report(a, { targetType: 'notice', targetId: bad.restaurantId })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
