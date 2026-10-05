import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOODS_TYPE, resolveShardSettings } from '@dt/config';
import { seededRng } from '@dt/shared';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { getEffectAgg } from '../../modules/effects/service';
import { grantGoods as grantGoodsDb } from '../../modules/store/grant';
import { aggOf, grantGoods, openFastRest } from './ops';
import type { FastCtx } from './state';
import { cid } from '../../../test/items';
import { setGrade } from '../../modules/cookbook/rules';

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

describe('结算源字段一一对应（终审 I-3，设计 §9 第一条）', () => {
  it('同样的店铺数值：真实结算器和快速模型拼出完全相同的结算输入', async () => {
    const { rowSettleSource } = await import('../../modules/settlement/runner');
    const { toSettleInput } = await import('../../modules/settlement/globals');
    const { fastSettleSource } = await import('./round');
    const config = t.deps.config;
    const ctx = await newRestaurant(t);
    await t.db
      .updateTable('restaurant')
      .set({
        level: 7,
        star_level: 2,
        oil: 333,
        oil_max: 1500,
        coin: 4321,
        street_id: 3,
        renown: 77,
        luck: 9,
        cte_on: true,
        cookfoods_flag: 0,
      })
      .where('id', '=', ctx.restaurantId)
      .execute();
    const row = await t.db
      .selectFrom('restaurant')
      .selectAll()
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const tables = [{ no: 1, floor: 1, customer: 0 }];
    const levels = new Uint8Array(config.cookbookIndex.slots);
    setGrade(levels, config.cookbookIndex.slotOf, cid('南煎丸子'), 2);
    const agg = { atRate: 0.2 };
    const settings = resolveShardSettings(config, {});
    const c: FastCtx = {
      config,
      tuning: settings.tuning,
      now: t.clock.now,
      rng: seededRng(1),
      stats: { income: {} },
    };
    const r = openFastRest(c, ctx.restaurantId, settings);
    Object.assign(r, {
      level: 7,
      star: 2,
      oil: 333,
      oilMax: 1500,
      coin: 4321,
      streetId: 3,
      renown: 77,
      luck: 9,
      cteOn: true,
      cookfoodsFlag: 0,
    });
    r.tables = tables;
    r.levels = levels;
    r.counts = row.cookbook_counts as never;
    const real = toSettleInput(rowSettleSource(row, tables, levels, agg, null, null, t.clock.now));
    const fast = toSettleInput(fastSettleSource(r, agg, t.clock.now));
    expect(fast).toEqual(real);
  });

  it('摆一个设施：加成汇总一致', async () => {
    const { placeDevice } = await import('./bot');
    const config = t.deps.config;
    const settings = resolveShardSettings(config, {});
    const dev = [...config.devices.values()].find((d) => d.needStar === 0 && d.id !== 7)!;
    const goods = [...config.goods.values()].find(
      (g) =>
        g.type === GOODS_TYPE.device && g.deviceType === dev.deviceType && Object.keys(g.effects).length > 1,
    )!;
    const ctx = await newRestaurant(t);
    await t.db.deleteFrom('effect_source').where('rest_id', '=', ctx.restaurantId).execute();
    await t.db.deleteFrom('store_item').where('rest_id', '=', ctx.restaurantId).execute();
    await grantGoodsDb(t.db, config, ctx.restaurantId, goods.id, 1, t.clock.now);
    await t.game.growth.placeDevice(ctx, { slot: dev.id, goodsId: goods.id });
    const real = await getEffectAgg(t.db, ctx.restaurantId, t.clock.now, config, config.tuning);
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
    grantGoods(c, r, goods.id, 1, 'test');
    expect(placeDevice(c, r, dev.id, goods.id)).toBe(true);
    expect(aggOf(c, r)).toEqual(real);
  });
});
