import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS_TYPE, resolveShardSettings } from '@dt/config';
import { seededRng } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { getEffectAgg } from '../../modules/effects/service';
import { grantGoods as grantGoodsDb } from '../../modules/store/grant';
import { aggOf, grantGoods, openFastRest } from './ops';
import type { FastCtx } from './state';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('结算输入一致（设计 §9 第一条）', () => {
  it('同样只有一个勋章：真实服务和快速模型的加成汇总一致', async () => {
    const config = t.deps.config;
    const honor = [...config.goods.values()].find(
      (g) => g.type === GOODS_TYPE.honor && !config.isStreetMedal(g) && Object.keys(g.effects).length > 0,
    )!;
    const ctx = await newRestaurant(t);
    await t.db.deleteFrom('effect_source').where('rest_id', '=', ctx.restaurantId).execute();
    await t.db.deleteFrom('store_item').where('rest_id', '=', ctx.restaurantId).execute();
    await grantGoodsDb(t.db, config, ctx.restaurantId, honor.id, 1, t.clock.now);
    const real = await getEffectAgg(t.db, ctx.restaurantId, t.clock.now, config, config.tuning);

    const settings = resolveShardSettings(config, {});
    const c: FastCtx = {
      config,
      tuning: settings.tuning,
      now: t.clock.now,
      rng: seededRng(1),
      stats: { income: {} },
    };
    const r = openFastRest(c, 1, settings);
    r.effects = [];
    r.store.clear();
    grantGoods(c, r, honor.id, 1, 'test');
    expect(aggOf(c, r)).toEqual(real);
  });
});
