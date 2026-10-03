import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { roundOf } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import type { DB } from '../../db/schema';
import { spendCoin } from '../../core/resources';
import { upsertEffectSource } from '../effects/service';
import { grantGoods } from '../store/grant';
import { runDueJobs } from '../../worker/periodic';
import { settleShardRound } from './runner';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const round = roundOf(new Date());
const settle = (shardId: number, r = round) =>
  settleShardRound(t.game.deps, t.game.world, shardId, r, new Date());
const income = (restId: number) =>
  t.db.selectFrom('income_round').selectAll().where('rest_id', '=', restId).execute();

describe('settleShardRound', () => {
  it('每轮每店只结算一次；收益写入餐厅和 income_round', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 1000 } });
    const s1 = await settle(shardId);
    expect(s1).toMatchObject({ restaurants: 1, settled: 1, failed: 0 });
    const rows = await income(ctx.restaurantId);
    expect(rows).toHaveLength(1);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.coin).toBe(1000 + rows[0]!.coin);
    expect(r.oil).toBe(1000 - rows[0]!.oil);
    const tables = await t.db
      .selectFrom('restaurant_tables')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(tables.round_no).toBe(round);
    expect(tables.tables.every((x) => x.last !== undefined)).toBe(true);

    const s2 = await settle(shardId);
    expect(s2).toMatchObject({ settled: 0, skipped: 1 });
    expect(await income(ctx.restaurantId)).toHaveLength(1);
  });

  it('自然蟑螂跟随 friend 功能：开启时产生，区服关闭 friend 时不产生', async () => {
    // 概率给到 100：乘上任何天气系数都必定出现
    // 上限比例给到 1：这里测的是功能开关，不是蟑螂上限（问题记录 228）
    const tuning = { settlement: { roachRateBase: 100, roachRatePerStar: 0, roachMaxShare: 1 } };
    const on = await createShard(t.db);
    const off = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values([
        { shard_id: on, override: JSON.stringify({ tuning }) },
        { shard_id: off, override: JSON.stringify({ tuning, features: { friend: false } }) },
      ])
      .execute();
    const a = await newRestaurant(t, { shardId: on, patch: { coin: 1000, oil: 1000 } });
    const b = await newRestaurant(t, { shardId: off, patch: { coin: 1000, oil: 1000 } });
    await settle(on);
    await settle(off);
    const roaches = async (restId: number) =>
      (
        await t.db
          .selectFrom('restaurant_tables')
          .select('tables')
          .where('rest_id', '=', restId)
          .executeTakeFirstOrThrow()
      ).tables.filter((x) => x.customer === 3).length;
    expect(await roaches(a.restaurantId)).toBe(4);
    expect(await roaches(b.restaurantId)).toBe(0);
  });

  it('单店结算出错时经由 worker 的日志记下区服、轮次和餐厅（设计文档 §4.1）', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 1000 } });
    await t.db
      .updateTable('restaurant_tables')
      .set({ tables: JSON.stringify({ broken: true }) })
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    const log = { error: vi.fn() };
    const jobs = t.game.jobs.filter((j) => j.name === 'settlement');
    await runDueJobs({ db: t.db, shards: t.game.shards, now: () => t.clock.now, log }, jobs, {
      shardIds: [shardId],
    });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ shardId, restId: ctx.restaurantId, round: expect.any(Number) }),
      'settlement failed',
    );
  });

  it('没油：停业，不写收益；停业店不再进入结算', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { oil: 0 } });
    expect(await settle(shardId)).toMatchObject({ closed: 1 });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ state: 2, state_reason: 'no_oil' });
    expect(await income(ctx.restaurantId)).toHaveLength(0);
    expect(await settle(shardId, round + 1)).toMatchObject({ restaurants: 0 });
  });

  it('白食让本轮银币为负时，餐厅银币最低到 0（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const tables = [1, 2, 3, 4].map((no) => ({
      no,
      floor: 1,
      customer: 9,
      freeloader: { restId: 1, level: 100, since, coin: 0, exp: 0 },
    }));
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 5 }, tables });
    await settle(shardId);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(0);
    expect((await income(ctx.restaurantId))[0]!.coin).toBeLessThan(0);
  });

  it('结算与玩家操作同时进行：行锁串行，两边的改动都在', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000 } });
    await Promise.all([
      settle(shardId),
      runOp(t.game.deps, ctx, { feature: 'restaurant', source: 'test' }, async (op) => spendCoin(op, 100)),
    ]);
    const [row] = await income(ctx.restaurantId);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1000 - 100 + row!.coin);
  });

  it('没有痞老板驻留店时，从 1 星及以上的营业店里选一家', async () => {
    const shardId = await createShard(t.db);
    await newRestaurant(t, { shardId });
    const star = await newRestaurant(t, { shardId, patch: { star_level: 1 } });
    await settle(shardId);
    expect((await t.game.world.ensure(shardId)).planktonRestId).toBe(star.restaurantId);
  });

  it('刚赶走痞老板的店冷却期内不再被选为驻留店；冷却过后可以（问题记录：痞老板太频繁）', async () => {
    const shardId = await createShard(t.db);
    const now = new Date();
    const star = await newRestaurant(t, {
      shardId,
      patch: { star_level: 1, plankton_cooldown_until: new Date(now.getTime() + 3600_000) },
    });
    await settle(shardId);
    expect((await t.game.world.ensure(shardId)).planktonRestId).toBeNull();
    await t.db
      .updateTable('restaurant')
      .set({ plankton_cooldown_until: new Date(now.getTime() - 1000) })
      .where('id', '=', star.restaurantId)
      .execute();
    await settle(shardId);
    expect((await t.game.world.ensure(shardId)).planktonRestId).toBe(star.restaurantId);
  });

  it('集齐 7 幅名画：油量低于 2000 时自动加满', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 100000, oil: 1000, oil_max: 1500 } });
    for (const id of [312, 336, 337, 349, 359, 360, 361]) {
      await grantGoods(t.db, t.game.deps.config, ctx.restaurantId, id, 1, new Date());
    }
    await settle(shardId);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.oil).toBe(1500);
    expect(r.coin).toBeLessThan(100000 + (await income(ctx.restaurantId))[0]!.coin);
  });
});

describe('特色菜（子项目 4A，规格书 01 §1.7）', () => {
  /** 桌桌坐满、没有挑剔顾客：每桌普通顾客吃 1 份 */
  const busy = { tuning: { rest: { atRateBase: 5, spRateBase: -5 } } };
  async function withDish(left: number) {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify(busy) })
      .execute();
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 100000, star_level: 1 } });
    const c = await t.db
      .insertInto('mc_cook')
      .values({
        rest_id: ctx.restaurantId,
        shard_id: shardId,
        mc_id: 1,
        level: 4,
        grade: 3,
        cook_num: 1,
        total_num: left,
        left_num: left,
        price: 50,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .updateTable('restaurant')
      .set({ mc_cook_id: c.id })
      .where('id', '=', ctx.restaurantId)
      .execute();
    return { shardId, ctx, cookId: c.id };
  }
  const cookOf = (id: number) =>
    t.db.selectFrom('mc_cook').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  it('有在售时按顾客扣份数', async () => {
    const { shardId, cookId } = await withDish(1000);
    await settle(shardId);
    const c = await cookOf(cookId);
    expect(c.left_num).toBeLessThan(1000);
    expect(c.ended_at).toBeNull();
  });

  it('卖完：结束这批（sold）、清空餐厅指针', async () => {
    const { shardId, ctx, cookId } = await withDish(1);
    await settle(shardId);
    const c = await cookOf(cookId);
    expect(c).toMatchObject({ left_num: 0, end_reason: 'sold' });
    expect(c.ended_at).not.toBeNull();
    expect((await restRow(t, ctx.restaurantId)).mc_cook_id).toBeNull();
  });
});

describe('结算的数据库往返（问题记录 258：结算余量）', () => {
  it('一家普通店一轮 6 条语句（原来 9 条）：开始事务、锁店读行、读餐桌和食谱、写餐桌和收益记录、写回店铺、提交', async () => {
    // 只数这家店的结算事务（begin 到 commit）：区服级的查询（世界状态、区服设置缓存等）在事务外，
    // 跟时间和缓存过期有关，全量并行跑时偶尔多一条，不能靠两个区服相减抵消（CI 上 7 ≠ 6）
    let sqls: string[] = [];
    const db = new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 }),
      }),
      log: (e) => {
        if (e.level === 'query') sqls.push(e.query.sql);
      },
    });
    const g = await createTestGame({ db });
    try {
      const shardId = await createShard(g.db);
      await newRestaurant(g, { shardId, patch: { coin: 1000, oil: 100000 } });
      // 第一轮会顺带算出加成汇总（新店的 effect_dirty 默认为 true），从第二轮开始计数
      await settleShardRound(g.game.deps, g.game.world, shardId, round, new Date());
      sqls = [];
      const s = await settleShardRound(g.game.deps, g.game.world, shardId, round + 1, new Date());
      expect(s).toMatchObject({ settled: 1, failed: 0 });
      const from = sqls.indexOf('begin');
      const tx = sqls.slice(from, sqls.indexOf('commit', from) + 1);
      // 随机事件（掉神秘礼券、蟹币、蟹老板、痞老板）额外写仓库、加成、日志、新闻，种子按区服、店 id 取，不数
      const fixed = tx.filter((q) => !/"(store_item|effect_source|rest_log|news)"|"effect_dirty"/.test(q));
      expect(fixed).toHaveLength(6);
    } finally {
      await db.destroy();
      await g.close();
    }
  });
});

describe('结算取加成汇总（问题记录 258：改用锁行时读到的加成列）', () => {
  it('两轮之间加成来源变了（标脏）、或有来源到期：下一轮照样重算并写回', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 100000 } });
    const agg = async () =>
      await t.db
        .selectFrom('restaurant')
        .select(['effect_agg', 'effect_dirty'])
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
    await settle(shardId, round);
    await upsertEffectSource(t.db, ctx.restaurantId, {
      sourceType: 'test',
      sourceId: 1,
      effects: { luckValue: 123 },
      expiresAt: new Date(Date.now() + 300),
    });
    expect((await agg()).effect_dirty).toBe(true);
    await settle(shardId, round + 1);
    expect(await agg()).toMatchObject({ effect_dirty: false, effect_agg: { luckValue: 123 } });
    await new Promise((r) => setTimeout(r, 400));
    await settle(shardId, round + 2);
    expect((await agg()).effect_agg.luckValue ?? 0).toBe(0);
  });
});
