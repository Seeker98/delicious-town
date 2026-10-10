import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminBulkFoodDto, AdminBulkLotDto } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';
import { FUTURES_INITIAL } from '../../db/migrations/0063_futures';

/** 后台“大宗认购”页（大宗认购设计 §3.2） */
const config = testConfig();
let ctx: TestContext;
let admin: { cookie: string };
let mod: { cookie: string };
beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userWithRole(ctx, 'admin');
  mod = await userWithRole(ctx, 'mod');
});
afterAll(() => ctx.close());

const A = '/api/v1/admin/bulk';
const db = () => ctx.deps.db;
const foods = async (shardId: number) =>
  (await call(ctx.app, 'GET', `${A}/foods?shardId=${shardId}`, { cookie: mod.cookie })).json
    .data as AdminBulkFoodDto[];
/**
 * 改全服共用的清单时用期货初始列表最后两种（五级）：期货和认购的其他测试不用它们
 *（认购开批次测试按权重只开四级；期货测试用的是列表前面的食材）
 */
const X = FUTURES_INITIAL[FUTURES_INITIAL.length - 1]!;
const Y = FUTURES_INITIAL[FUTURES_INITIAL.length - 2]!;
let dayN = 0;

async function mkLot(shardId: number, status: 'open' | 'settled' = 'open') {
  const now = new Date();
  return (
    await db()
      .insertInto('bulk_lot')
      .values({
        shard_id: shardId,
        day: `2028-02-${String((++dayN % 28) + 1).padStart(2, '0')}`,
        foods_id: X,
        level: 5,
        qty: 10,
        reserve: 50_000,
        cap: 2,
        group_qty: 3,
        opens_at: now,
        ends_at: new Date(now.getTime() + 3_600_000),
        close_at: new Date(now.getTime() + 3_000_000),
        status,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
}

describe('后台大宗认购', () => {
  it('列表：1~5 级没下架的都在；是否在清单、是否启用、期货里是否启用', async () => {
    const shardId = await createShard(db());
    const rows = await foods(shardId);
    const all = [...config.foods.values()].filter((f) => f.level >= 1 && f.level <= 5 && !f.retired);
    expect(rows).toHaveLength(all.length);
    const futures = await db().selectFrom('futures_food').select(['foods_id', 'enabled']).execute();
    const f = futures[0]!;
    expect(rows.find((r) => r.foodsId === f.foods_id)!.futuresEnabled).toBe(f.enabled);
    const notInFutures = all.find((x) => !futures.some((r) => r.foods_id === x.id))!;
    expect(rows.find((r) => r.foodsId === notInFutures.id)!.futuresEnabled).toBeNull();
    expect(rows.every((r) => r.reserve > 0)).toBe(true);
  });

  it('协管只能看；管理员批量停用、启用；不存在的食材整批不改', async () => {
    const shardId = await createShard(db());
    const save = (items: unknown[], cookie = admin.cookie) =>
      call(ctx.app, 'POST', `${A}/foods`, { cookie, body: { items } });
    expect((await save([{ foodsId: X, enabled: false }], mod.cookie)).status).toBe(404);
    try {
      expect((await save([{ foodsId: X, enabled: false }])).status).toBe(200);
      expect((await foods(shardId)).find((r) => r.foodsId === X)).toMatchObject({
        inList: true,
        enabled: false,
      });
      const bad = await save([
        { foodsId: X, enabled: true },
        { foodsId: 999_999, enabled: true },
      ]);
      expect(bad.json.code).toBe('VALIDATION_FAILED');
      expect((await foods(shardId)).find((r) => r.foodsId === X)!.enabled).toBe(false);
    } finally {
      await db().updateTable('bulk_food').set({ enabled: true }).where('foods_id', '=', X).execute();
    }
  });

  it('从期货同步：期货停用的在这里停用；期货启用、不在清单里的加进来；写审计', async () => {
    const shardId = await createShard(db());
    try {
      await db().updateTable('futures_food').set({ enabled: false }).where('foods_id', '=', X).execute();
      await db().deleteFrom('bulk_food').where('foods_id', '=', Y).execute();
      expect((await call(ctx.app, 'POST', `${A}/foods/sync`, { cookie: mod.cookie })).status).toBe(404);
      expect((await call(ctx.app, 'POST', `${A}/foods/sync`, { cookie: admin.cookie })).status).toBe(200);
      const rows = await foods(shardId);
      expect(rows.find((r) => r.foodsId === X)).toMatchObject({
        inList: true,
        enabled: false,
        futuresEnabled: false,
      });
      expect(rows.find((r) => r.foodsId === Y)).toMatchObject({ inList: true, enabled: true });
      const audit = await db()
        .selectFrom('audit_log')
        .select('detail')
        .where('action', '=', 'bulk.sync')
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow();
      expect(audit.detail).toHaveProperty('before');
      expect(audit.detail).toHaveProperty('after');
    } finally {
      await db().updateTable('futures_food').set({ enabled: true }).where('foods_id', '=', X).execute();
      await db()
        .insertInto('bulk_food')
        .values([
          { foods_id: X, enabled: true },
          { foods_id: Y, enabled: true },
        ])
        .onConflict((oc) => oc.column('foods_id').doUpdateSet({ enabled: true }))
        .execute();
    }
  });

  it('批次列表带真正的收盘时刻、出价人数、认购份数', async () => {
    const shardId = await createShard(db());
    const lotId = await mkLot(shardId);
    const p = await playerIn(ctx, shardId);
    await db()
      .insertInto('bulk_bid')
      .values({
        lot_id: lotId,
        rest_id: p.restId,
        shard_id: shardId,
        price: 50_000,
        qty: 2,
        frozen: 100_000,
        ranked_at: new Date(),
        last_bid_at: new Date(),
      })
      .execute();
    const lots = (await call(ctx.app, 'GET', `${A}/lots?shardId=${shardId}`, { cookie: mod.cookie })).json
      .data as AdminBulkLotDto[];
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ id: Number(lotId), status: 'open', bidders: 1, demand: 2 });
    expect(typeof lots[0]!.closeAt).toBe('string');
  });

  it('取消进行中的批次：全额退回、之后不能出价；已结算的不能取消（Review Focus 5）', async () => {
    const shardId = await createShard(db());
    const lotId = await mkLot(shardId);
    const p = await playerIn(ctx, shardId);
    await db()
      .updateTable('restaurant')
      .set({ level: 30, coin: 900_000 })
      .where('id', '=', p.restId)
      .execute();
    await db()
      .updateTable('account')
      .set({ created_at: sql`now() - interval '30 days'` })
      .where('id', '=', p.accountId)
      .execute();
    await db()
      .insertInto('bulk_bid')
      .values({
        lot_id: lotId,
        rest_id: p.restId,
        shard_id: shardId,
        price: 50_000,
        qty: 2,
        frozen: 100_000,
        ranked_at: new Date(),
        last_bid_at: new Date(),
      })
      .execute();
    expect((await call(ctx.app, 'POST', `${A}/lots/${lotId}/cancel`, { cookie: mod.cookie })).status).toBe(
      404,
    );
    expect((await call(ctx.app, 'POST', `${A}/lots/${lotId}/cancel`, { cookie: admin.cookie })).status).toBe(
      200,
    );
    const lot = await db()
      .selectFrom('bulk_lot')
      .select('status')
      .where('id', '=', lotId)
      .executeTakeFirstOrThrow();
    expect(lot.status).toBe('cancelled');
    const r = await db()
      .selectFrom('restaurant')
      .select('coin')
      .where('id', '=', p.restId)
      .executeTakeFirstOrThrow();
    expect(Number(r.coin)).toBe(1_000_000);
    const bid = await call(ctx.app, 'POST', '/api/v1/bulk/bid', {
      cookie: p.cookie,
      body: { lotId: Number(lotId), price: 60_000, qty: 1 },
    });
    expect(bid.json).toMatchObject({ code: 'INVALID_STATE', params: { reason: 'bulk_not_open' } });
    const settled = await mkLot(shardId, 'settled');
    const again = await call(ctx.app, 'POST', `${A}/lots/${settled}/cancel`, { cookie: admin.cookie });
    expect(again.json).toMatchObject({ code: 'INVALID_STATE', params: { reason: 'bulk_not_open' } });
  });
});
