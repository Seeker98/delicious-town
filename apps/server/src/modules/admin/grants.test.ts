import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { userWithRole } from '../../../test/admin';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import type { AdminActor } from './access';
import { createAdminGrants, processGrants } from './grants';

describe('补偿（HTTP）', () => {
  let ctx: TestContext;
  let admin: { cookie: string };
  let mod: { cookie: string };
  let t: TestGame;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await userWithRole(ctx, 'admin');
    mod = await userWithRole(ctx, 'mod');
    t = await createTestGame();
  });
  afterAll(async () => {
    await ctx.close();
    await t.close();
  });

  const grant = (cookie: string, body: unknown) =>
    call(ctx.app, 'POST', '/api/v1/admin/grants', { cookie, body });

  it('单店立即到账：银币、道具、食材，写流水、个人日志和记录', async () => {
    const r0 = await newRestaurant(t, { patch: { coin: 100 } });
    const r = await grant(admin.cookie, {
      shardId: r0.shardId,
      target: 'rest',
      restId: r0.restaurantId,
      items: { coin: 500, goods: [{ id: 1, num: 2 }], foods: [{ id: 101, num: 3 }] },
      reason: '停服补偿',
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ status: 'done', total: 1, doneCount: 1, reason: '停服补偿' });
    expect((await restRow(t, r0.restaurantId)).coin).toBe(600);
    expect(await goodsNum(t, r0.restaurantId, 1)).toBe(2);
    expect((await foodNum(t, r0.restaurantId, 101)).num).toBe(3);
    const ledger = await t.db
      .selectFrom('ledger')
      .select('source')
      .where('rest_id', '=', r0.restaurantId)
      .execute();
    expect(ledger.every((l) => l.source === 'admin.grant')).toBe(true);
    const log = await t.db
      .selectFrom('rest_log')
      .selectAll()
      .where('rest_id', '=', r0.restaurantId)
      .where('type', '=', 'admin.grant')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ reason: '停服补偿' });
  });

  it('橱柜满了新食材进冰箱，不报错', async () => {
    const r0 = await newRestaurant(t, { patch: { cupboard_num: 1 }, foods: { 102: 1 } });
    await grant(admin.cookie, {
      shardId: r0.shardId,
      target: 'rest',
      restId: r0.restaurantId,
      items: { foods: [{ id: 101, num: 2 }] },
      reason: 'x',
    });
    expect(await foodNum(t, r0.restaurantId, 101)).toMatchObject({ num: 0, fridge: 2 });
  });

  it('超上限、不存在的道具、空内容都 400；mod 404', async () => {
    const r0 = await newRestaurant(t);
    const base = { shardId: r0.shardId, target: 'rest', restId: r0.restaurantId, reason: 'x' };
    expect((await grant(admin.cookie, { ...base, items: { coin: 100_000_001 } })).status).toBe(400);
    expect(
      (await grant(admin.cookie, { ...base, items: { goods: [{ id: 99999999, num: 1 }] } })).status,
    ).toBe(400);
    expect((await grant(admin.cookie, { ...base, items: {} })).status).toBe(400);
    expect((await grant(mod.cookie, { ...base, items: { coin: 1 } })).status).toBe(404);
  });

  it('全区服：预览人数，建记录后排队', async () => {
    const shardId = await createShard(t.db);
    await newRestaurant(t, { shardId, patch: { level: 1 } });
    await newRestaurant(t, { shardId, patch: { level: 10 } });
    const pv = await call(ctx.app, 'GET', `/api/v1/admin/grants/preview?shardId=${shardId}&minLevel=5`, {
      cookie: admin.cookie,
    });
    expect(pv.json.data).toEqual({ count: 1 });
    const r = await grant(admin.cookie, {
      shardId,
      target: 'shard',
      minLevel: 5,
      items: { coin: 1 },
      reason: 'x',
    });
    expect(r.json.data).toMatchObject({ status: 'pending', total: 1, doneCount: 0 });
    const list = await call(ctx.app, 'GET', `/api/v1/admin/grants?shardId=${shardId}`, {
      cookie: mod.cookie,
    });
    expect(list.json.data[0].id).toBe(r.json.data.id);
  });
});

describe('全区服发放（worker）', () => {
  let t: TestGame;
  const actor: AdminActor = { accountId: 0, username: 'x', role: 'admin', ip: '127.0.0.1' };
  const log = { error: vi.fn() };
  beforeAll(async () => {
    t = await createTestGame();
    const a = await t.db
      .insertInto('account')
      .values({ username: `g${Date.now() % 1_000_000}`, password_hash: 'x', email: `g${Date.now()}@t.local` })
      .returning('id')
      .executeTakeFirstOrThrow();
    actor.accountId = a.id;
  });
  afterAll(() => t.close());

  const shardGrant = (shardId: number, minLevel?: number) =>
    createAdminGrants(t.game).create(actor, {
      shardId,
      target: 'shard',
      minLevel,
      items: { coin: 10 },
      reason: '全服补偿',
    });
  const grantRow = (id: number) =>
    t.db.selectFrom('admin_grant').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  /** worker 按创建顺序处理所有区服的发放（测试库里可能还留着以前的），一直处理到这一条结束 */
  async function drain(id: number, parallel = 1, batch = 200) {
    for (let i = 0; i < 200; i++) {
      const r = await grantRow(id);
      if (r.status === 'done' || r.status === 'failed') return;
      await Promise.all(Array.from({ length: parallel }, () => processGrants(t.game, log, batch)));
    }
    throw new Error('grant not finished');
  }

  it('分批处理到完成；min_level 过滤；重跑不重复', async () => {
    const shardId = await createShard(t.db);
    const low = await newRestaurant(t, { shardId, patch: { level: 1, coin: 0 } });
    const highs = await Promise.all(
      [1, 2, 3].map(() => newRestaurant(t, { shardId, patch: { level: 10, coin: 0 } })),
    );
    const g = await shardGrant(shardId, 5);
    await drain(g.id, 1, 2);
    expect(await grantRow(g.id)).toMatchObject({ status: 'done', done_count: 3, failed_count: 0 });
    for (const h of highs) expect((await restRow(t, h.restaurantId)).coin).toBe(10);
    expect((await restRow(t, low.restaurantId)).coin).toBe(0);
    await t.db.updateTable('admin_grant').set({ status: 'running' }).where('id', '=', g.id).execute();
    await drain(g.id);
    for (const h of highs) expect((await restRow(t, h.restaurantId)).coin).toBe(10);
  });

  it('一家店出错：记失败、其他店照发，最终状态 failed', async () => {
    const shardId = await createShard(t.db);
    const ok = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const broken = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    await sql`create or replace function fail_grant_log() returns trigger as $$
      begin raise exception 'boom'; end $$ language plpgsql`.execute(t.db);
    await sql
      .raw(
        `create trigger fail_grant_log_${broken.restaurantId} before insert on rest_log for each row
         when (new.rest_id = ${broken.restaurantId}) execute function fail_grant_log()`,
      )
      .execute(t.db);
    try {
      const g = await shardGrant(shardId);
      await drain(g.id);
      expect(await grantRow(g.id)).toMatchObject({ status: 'failed', done_count: 1, failed_count: 1 });
      expect((await restRow(t, ok.restaurantId)).coin).toBe(10);
      expect((await restRow(t, broken.restaurantId)).coin).toBe(0);
      expect(log.error).toHaveBeenCalled();
    } finally {
      await sql.raw(`drop trigger fail_grant_log_${broken.restaurantId} on rest_log`).execute(t.db);
    }
  });

  it('两个 worker 同时处理同一条发放：每家店只到账一次（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const rs = await Promise.all([1, 2, 3, 4].map(() => newRestaurant(t, { shardId, patch: { coin: 0 } })));
    const g = await shardGrant(shardId);
    await drain(g.id, 2);
    for (const r of rs) expect((await restRow(t, r.restaurantId)).coin).toBe(10);
  });
});
