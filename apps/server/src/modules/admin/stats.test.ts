import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameTime } from '@dt/shared';
import { userWithRole } from '../../../test/admin';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { aggregateDay, distribution, rollupDay, settlementRounds, statDailyJob } from './stats';

let ctx: TestContext;
let mod: { cookie: string };
beforeAll(async () => {
  ctx = await createTestApp();
  mod = await userWithRole(ctx, 'mod');
});
afterAll(() => ctx.close());

const DAY = '2026-06-01';

async function shopIn(shardId: number, patch = {}) {
  return createRestaurantFull(ctx.deps.db, shardId, await createAccountRow(ctx.deps.db), { patch });
}

describe('每日汇总', () => {
  it('流水按 (kind, source) 求和，结算记 settlement，活跃店排除系统来源；日界按北京时间（Review Focus 2）', async () => {
    const db = ctx.deps.db;
    const shardId = await createShard(db);
    const a = await shopIn(shardId);
    const b = await shopIn(shardId);
    const at = (h: number, m = 0) => gameTime(DAY, h, m);
    await db
      .insertInto('ledger')
      .values([
        { rest_id: a, kind: 'coin', delta: 100, source: 'signin', created_at: at(12) },
        { rest_id: a, kind: 'coin', delta: -30, source: 'market.buy', created_at: at(13) },
        // 北京时间 23:59（UTC 15:59）算这一天；00:00（UTC 16:00）算下一天
        { rest_id: a, kind: 'coin', delta: 7, source: 'signin', created_at: at(23, 59) },
        { rest_id: a, kind: 'coin', delta: 1000, source: 'signin', created_at: gameTime(addDays(DAY, 1), 0) },
        { rest_id: b, kind: 'foods', item_id: 101, delta: -1, source: 'mouse', created_at: at(3) },
      ])
      .execute();
    await db
      .insertInto('income_round')
      .values({
        rest_id: b,
        round_no: 1,
        coin: 50,
        exp: 20,
        oil: 2,
        customers: JSON.stringify({}),
        rates: JSON.stringify({}),
        drops: JSON.stringify([]),
        created_at: at(10),
      })
      .execute();
    const rows = await aggregateDay(db, shardId, DAY);
    const amount = (kind: string, source: string) =>
      rows.find((r) => r.kind === kind && r.source === source)?.amount ?? 0;
    expect(amount('coin', 'signin')).toBe(107);
    expect(amount('coin', 'market.buy')).toBe(-30);
    expect(amount('coin', 'settlement')).toBe(50);
    expect(amount('exp', 'settlement')).toBe(20);
    expect(amount('foods', 'mouse')).toBe(-1);
    expect(amount('active', 'rest')).toBe(1);
    expect(await rollupDay(db, shardId, DAY)).toBe(rows.length);
    expect(await rollupDay(db, shardId, DAY)).toBe(rows.length);
    const stored = await db.selectFrom('stat_daily').selectAll().where('shard_id', '=', shardId).execute();
    expect(stored).toHaveLength(rows.length);
    expect(stored.every((r) => r.day === DAY)).toBe(true);
  });

  it('只有系统自动产生的流水（自动加油、结算消耗食材、捕鼠夹、竞猜加奖）的店不算活跃', async () => {
    const db = ctx.deps.db;
    const shardId = await createShard(db);
    const a = await shopIn(shardId);
    const at = gameTime(DAY, 12);
    await db
      .insertInto('ledger')
      .values([
        { rest_id: a, kind: 'oil', delta: 100, source: 'oil.auto', created_at: at },
        {
          rest_id: a,
          kind: 'foods',
          item_id: 101,
          delta: -1,
          source: 'settlement.cookfoods',
          created_at: at,
        },
        { rest_id: a, kind: 'coin', delta: 50, source: 'mouse.trap', created_at: at },
        { rest_id: a, kind: 'goods', item_id: 240, delta: 15, source: 'market.guess.bonus', created_at: at },
      ])
      .execute();
    const rows = await aggregateDay(db, shardId, DAY);
    expect(rows.find((r) => r.kind === 'active')).toBeUndefined();
  });

  it('周期键：00:10 之后才汇总前一天', () => {
    const job = statDailyJob(ctx.deps.db);
    const s = {} as never;
    expect(job.period(gameTime(DAY, 0, 5), s)).toBeNull();
    expect(job.period(gameTime(DAY, 0, 10), s)).toBe(addDays(DAY, -1));
    expect(job.period(gameTime(DAY, 23, 0), s)).toBe(addDays(DAY, -1));
  });
});

describe('分布和结算健康', () => {
  it('等级分段、星级、食谱分段、营业和停业店数', async () => {
    const db = ctx.deps.db;
    const shardId = await createShard(db);
    await shopIn(shardId, { level: 3 });
    await shopIn(shardId, { level: 15, star_level: 1, state: 2 });
    const d = await distribution(db, shardId);
    expect(d).toMatchObject({ open: 1, closed: 1 });
    expect(d.levels).toEqual([
      { from: 1, to: 9, count: 1 },
      { from: 10, to: 19, count: 1 },
    ]);
    expect(d.stars).toEqual([
      { star: 0, count: 1 },
      { star: 1, count: 1 },
    ]);
    expect(d.cookbooks[0]).toMatchObject({ from: 0, to: 19, count: 2 });
  });

  it('最近若干轮结算：按轮次升序', async () => {
    const db = ctx.deps.db;
    const shardId = await createShard(db);
    for (const round of [1, 2, 3]) {
      await db
        .insertInto('job_run')
        .values({
          shard_id: shardId,
          job: 'settlement',
          period: String(round),
          started_at: new Date(Date.now() - (4 - round) * 240_000),
          finished_at: new Date(),
          stats: JSON.stringify({
            round,
            ms: round * 10,
            settled: 5,
            closed: 0,
            failed: round === 3 ? 1 : 0,
          }),
        })
        .execute();
    }
    const r = await settlementRounds(db, shardId, 2);
    expect(r.map((x) => x.round)).toEqual([2, 3]);
    expect(r[1]).toMatchObject({ ms: 30, settled: 5, failed: 1 });
  });

  it('接口：范围超过 90 天 400；mod 可以看', async () => {
    const shardId = await createShard(ctx.deps.db);
    const eco = (from: string, to: string) =>
      call(ctx.app, 'GET', `/api/v1/admin/stats/economy?shardId=${shardId}&from=${from}&to=${to}`, {
        cookie: mod.cookie,
      });
    expect((await eco('2026-01-01', '2026-06-01')).status).toBe(400);
    expect((await eco(DAY, DAY)).status).toBe(200);
    const dist = await call(ctx.app, 'GET', `/api/v1/admin/stats/distribution?shardId=${shardId}`, {
      cookie: mod.cookie,
    });
    expect(dist.status).toBe(200);
    const st = await call(ctx.app, 'GET', `/api/v1/admin/stats/settlement?shardId=${shardId}`, {
      cookie: mod.cookie,
    });
    expect(st.json.data).toEqual([]);
  });
});
