import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay, roundOf } from '@dt/shared';
import { setAcquireState } from '../../../test/acquire';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { settleShardRound } from '../settlement/runner';
import { share } from './rules';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const NOW = new Date();
const ROUND = roundOf(NOW);
const settle = (shardId: number, r = ROUND) => settleShardRound(t.game.deps, t.game.world, shardId, r, NOW);
const lastIncome = (restId: number) =>
  t.db
    .selectFrom('income_round')
    .select(['coin', 'ceded'])
    .where('rest_id', '=', restId)
    .orderBy('round_no', 'desc')
    .executeTakeFirstOrThrow();
const dues = (restId: number) =>
  t.db
    .selectFrom('acquire_due')
    .select(['day', 'owner_rest_id', 'coin', 'tended'])
    .where('rest_id', '=', restId)
    .execute();

/** 开着收购、银币倍率放大的区服：新店一轮只有几十银币，让渡按比例算会是 0 */
async function richShard(acquire = true): Promise<number> {
  const shardId = await createShard(t.db);
  await t.db
    .insertInto('shard_config')
    .values({
      shard_id: shardId,
      override: JSON.stringify({ features: { acquire }, tuning: { settlement: { coinMultiplier: 1000 } } }),
    })
    .execute();
  t.game.shards.invalidate(shardId);
  return shardId;
}

describe('结算时让渡（收购改版 2026-10-16）', () => {
  it('被收购的店每轮让 3.5% 记到当天、当时的老板；老板打理以后 × 1.035、让 4.9%，累加到同一行', async () => {
    const shardId = await richShard();
    const owner = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const store = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 100_000 } });
    await setAcquireState(t, store.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      acquired_at: NOW,
    });
    await settle(shardId);
    const r1 = await lastIncome(store.restaurantId);
    expect(r1.coin).toBeGreaterThan(100);
    expect(r1.ceded).toBe(share(r1.coin, 0.035));
    expect((await restRow(t, store.restaurantId)).coin).toBe(1000 + r1.coin - r1.ceded);
    // 老板只拿到自己那家的结算：让渡 00:05 才发
    expect((await restRow(t, owner.restaurantId)).coin).toBe((await lastIncome(owner.restaurantId)).coin);
    expect(await dues(store.restaurantId)).toEqual([
      { day: gameDay(NOW), owner_rest_id: owner.restaurantId, coin: r1.ceded, tended: false },
    ]);

    await setAcquireState(t, store.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      acquired_at: NOW,
      tended_at: NOW,
    });
    await settle(shardId, ROUND + 1);
    const r2 = await lastIncome(store.restaurantId);
    expect(r2.ceded).toBe(share(r2.coin, 0.049));
    expect(await dues(store.restaurantId)).toEqual([
      { day: gameDay(NOW), owner_rest_id: owner.restaurantId, coin: r1.ceded + r2.ceded, tended: true },
    ]);
  });

  it('没被收购的店、收购关着的区服不让', async () => {
    const shardId = await richShard();
    const free = await newRestaurant(t, { shardId, patch: { oil: 100_000 } });
    await setAcquireState(t, free.restaurantId, shardId);
    await settle(shardId);
    expect(await lastIncome(free.restaurantId)).toMatchObject({ ceded: 0 });
    expect((await lastIncome(free.restaurantId)).coin).toBeGreaterThan(100);

    const off = await richShard(false);
    const owner = await newRestaurant(t, { shardId: off });
    const store = await newRestaurant(t, { shardId: off, patch: { oil: 100_000 } });
    await setAcquireState(t, store.restaurantId, off, {
      owner_rest_id: owner.restaurantId,
      acquired_at: NOW,
    });
    await settle(off);
    expect((await lastIncome(store.restaurantId)).ceded).toBe(0);
    expect(await dues(store.restaurantId)).toEqual([]);
  });

  it('老板 7 天没打理：不再让', async () => {
    const shardId = await richShard();
    const owner = await newRestaurant(t, { shardId });
    const store = await newRestaurant(t, { shardId, patch: { oil: 100_000 } });
    const old = new Date(NOW.getTime() - 8 * 86_400_000);
    await setAcquireState(t, store.restaurantId, shardId, {
      owner_rest_id: owner.restaurantId,
      acquired_at: old,
      tended_at: old,
    });
    await settle(shardId);
    expect((await lastIncome(store.restaurantId)).ceded).toBe(0);
  });
});
