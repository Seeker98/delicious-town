import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { grantGoods } from '../store/grant';
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
