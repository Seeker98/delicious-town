import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay, type AdminFuturesFoodDto } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { foodPrice } from '../../core/prices';
import { FUTURES_INITIAL } from '../../db/migrations/0063_futures';
import { futuresUnitPrice } from './rules';

/** 后台“期货食材”页（期货设计 §5.3） */
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

const A = '/api/v1/admin/futures/foods';
const list = async (shardId: number, cookie = mod.cookie) =>
  (await call(ctx.app, 'GET', `${A}?shardId=${shardId}`, { cookie })).json.data as AdminFuturesFoodDto[];
const save = (items: unknown[], cookie = admin.cookie) =>
  call(ctx.app, 'POST', A, { cookie, body: { items } });
/** 不在初始列表里的 1 级普通食材（后台测试拿它加进表、再删掉） */
const OUTSIDE = [...config.foods.values()].find(
  (f) => f.level === 1 && f.odds === 100 && !f.retired && !FUTURES_INITIAL.includes(f.id),
)!.id;
const IN = FUTURES_INITIAL[0]!;

describe('后台期货食材', () => {
  it('列出 1~5 级全部没下架的食材；初始列表的上架、不在表里的标出来；街道、价格、已订份数', async () => {
    const shardId = await createShard(ctx.deps.db);
    await ctx.deps.db
      .insertInto('futures_quota')
      .values({ shard_id: shardId, foods_id: IN, day: gameDay(ctx.deps.now()), used: 7 })
      .execute();
    const rows = await list(shardId);
    const all = [...config.foods.values()].filter((f) => f.level >= 1 && f.level <= 5 && !f.retired);
    expect(rows).toHaveLength(all.length);
    const inRow = rows.find((r) => r.foodsId === IN)!;
    const food = config.foods.get(IN)!;
    expect(inRow).toMatchObject({ inList: true, enabled: true, dailyQuota: null, ordered: 7 });
    expect(inRow.defaultQuota).toBe(config.tuning.futures.dailyQuota[food.level - 1]);
    expect(inRow.levelPrice).toBe(foodPrice(food, config.tuning.market));
    expect(inRow.unitPrice).toBe(futuresUnitPrice(inRow.levelPrice, inRow.ref, config.tuning.futures));
    expect(inRow.streets.length).toBeGreaterThan(0);
    expect(rows.find((r) => r.foodsId === OUTSIDE)).toMatchObject({ inList: false, enabled: false });
  });

  it('协管只能看；管理员批量下架、上架（不在表里的加进表）、改额度、恢复默认，写审计', async () => {
    const shardId = await createShard(ctx.deps.db);
    expect((await save([{ foodsId: IN, enabled: false }], mod.cookie)).status).toBe(404);
    try {
      expect(
        (
          await save([
            { foodsId: IN, enabled: false },
            { foodsId: OUTSIDE, enabled: true, dailyQuota: 3 },
          ])
        ).status,
      ).toBe(200);
      let rows = await list(shardId);
      expect(rows.find((r) => r.foodsId === IN)).toMatchObject({ inList: true, enabled: false });
      expect(rows.find((r) => r.foodsId === OUTSIDE)).toMatchObject({
        inList: true,
        enabled: true,
        dailyQuota: 3,
      });
      expect((await save([{ foodsId: OUTSIDE, dailyQuota: null }])).status).toBe(200);
      rows = await list(shardId);
      expect(rows.find((r) => r.foodsId === OUTSIDE)).toMatchObject({ enabled: true, dailyQuota: null });
      const audit = await ctx.deps.db
        .selectFrom('audit_log')
        .select(['action', 'detail'])
        .where('action', '=', 'futures.foods')
        .orderBy('id', 'desc')
        .limit(2)
        .execute();
      // 审计带改前的样子（终审 I2）：批量下架以后能照着恢复；不在表里的记 null
      expect(audit[1]!.detail).toMatchObject({
        before: [
          { foodsId: IN, enabled: true, dailyQuota: null },
          { foodsId: OUTSIDE, enabled: null, dailyQuota: null },
        ],
      });
      expect(audit[0]!.detail).toMatchObject({
        before: [{ foodsId: OUTSIDE, enabled: true, dailyQuota: 3 }],
      });
    } finally {
      await ctx.deps.db
        .updateTable('futures_food')
        .set({ enabled: true })
        .where('foods_id', '=', IN)
        .execute();
      await ctx.deps.db.deleteFrom('futures_food').where('foods_id', '=', OUTSIDE).execute();
    }
  });

  it('不存在、6 级以上、已下架的食材报 VALIDATION_FAILED，整批不改', async () => {
    const lv6 = [...config.foods.values()].find((f) => f.level === 6)!.id;
    for (const bad of [999_999, lv6]) {
      const r = await save([
        { foodsId: OUTSIDE, enabled: true },
        { foodsId: bad, enabled: true },
      ]);
      expect(r.json.code).toBe('VALIDATION_FAILED');
    }
    const row = await ctx.deps.db
      .selectFrom('futures_food')
      .select('foods_id')
      .where('foods_id', '=', OUTSIDE)
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });
});
