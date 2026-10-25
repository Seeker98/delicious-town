import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay, gameTime } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { GOODS } from '@dt/config';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('神殿概览', () => {
  it('飞弹和探险图持有、试炼指定的花费、时令值余额', async () => {
    const day = gameDay(new Date());
    t.clock.set(gameTime(day, 12));
    const ctx = await newRestaurant(t, {
      patch: { star_level: 1, strength: 80 },
      goods: { [GOODS.missileCluster]: 2, [GOODS.mapHigh]: 3 },
    });
    await t.db
      .insertInto('rest_shiling')
      .values({ rest_id: ctx.restaurantId, shard_id: ctx.shardId, balance: 45 })
      .execute();
    const o = await t.game.temple.overview(ctx);
    expect(o).toMatchObject({ star: 1, strength: 80, shiling: 45 });
    expect(o.missiles).toContainEqual({ goodsId: GOODS.missileCluster, num: 2 });
    expect(o.missiles).toContainEqual({ goodsId: GOODS.missileNormal, num: 0 });
    expect(o.maps).toContainEqual({ goodsId: GOODS.mapHigh, num: 3, needStrength: 5 });
    expect(o.trial).toEqual({
      mcId: null,
      readyMinutes: 0,
      creatives: 0,
      worthMax: 30,
      expMax: 150,
      pickCost: 30,
      left: 10,
      daily: 10,
      profPerLevel: 800,
    });
  });

  it('区服关闭 temple：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { [GOODS.missileNormal]: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { temple: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(t.game.temple.overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.temple.missile(ctx, { goodsId: GOODS.missileNormal, num: 1 })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
