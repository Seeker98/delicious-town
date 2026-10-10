import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { trader } from '../exchange/test';
import { openLot } from '../bulk/open';
import { freezeDue } from '../bulk/service';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-10-12', 20, 1)));

const M = 1_000_000;
const hint = async (restId: number) => (await t.game.restaurant.overview(restId)).exchangeHint;
async function featuresOff(shardId: number, features: Record<string, boolean>) {
  await t.db
    .insertInto('shard_config')
    .values({ shard_id: shardId, override: JSON.stringify({ features }) })
    .execute();
  t.game.shards.invalidate(shardId);
}

describe('首页待办的交易所一行（问题记录 591）', () => {
  it('不满足交易所门槛时没有；满足了、没有大宗认购时只有交易所', async () => {
    const shardId = await createShard(t.db);
    const low = await newRestaurant(t, { shardId, patch: { level: 5 } });
    expect(await hint(low.restaurantId)).toBeNull();
    const ok = await trader(t, { shardId });
    expect(await hint(ok.restaurantId)).toEqual({ bulk: null });
  });

  it('有进行中的大宗认购：食材、等级、份数、已认购份数；停更后用停在那一刻的份数', async () => {
    const shardId = await createShard(t.db);
    expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('opened');
    const lot = await t.db
      .updateTable('bulk_lot')
      .set({ qty: 10, cap: 4, group_qty: 3, reserve: 50_000 })
      .where('shard_id', '=', shardId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const me = await trader(t, { shardId });
    const a = await trader(t, { shardId, coin: 20 * M });
    await t.game.bulk.bid(a, { lotId: Number(lot.id), price: 60_000, qty: 3 });
    expect(await hint(me.restaurantId)).toEqual({
      bulk: { foodsId: lot.foods_id, level: lot.level, qty: 10, demand: 3 },
    });
    // 进了停更、快照还没写：不给份数，免得从首页看到实时的认购量
    t.clock.set(new Date(lot.ends_at.getTime() - 59 * 60_000));
    expect((await hint(me.restaurantId))?.bulk?.demand).toBeNull();
    await freezeDue(t.game.deps, shardId, t.clock.now);
    const b = await trader(t, { shardId, coin: 20 * M });
    await t.game.bulk.bid(b, { lotId: Number(lot.id), price: 61_000, qty: 4 });
    expect((await hint(me.restaurantId))?.bulk?.demand).toBe(3);
  });

  it('区服关了交易所：没有这一行；只关了大宗认购：只有交易所', async () => {
    const off = await createShard(t.db);
    await featuresOff(off, { exchange: false });
    expect(await hint((await trader(t, { shardId: off })).restaurantId)).toBeNull();
    const noBulk = await createShard(t.db);
    expect(await openLot(t.game.deps, noBulk, t.clock.now)).toBe('opened');
    await featuresOff(noBulk, { bulk: false });
    expect(await hint((await trader(t, { shardId: noBulk })).restaurantId)).toEqual({ bulk: null });
  });
});
