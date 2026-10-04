import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

/** 取 n 道食谱，全部 1 品级 */
const learned = (n: number) =>
  Object.fromEntries(config.cookbookIndex.allIds.slice(0, n).map((id) => [id, 1]));

describe('加点（规格书 02 §2.3）', () => {
  it('只能加厨艺、刀工、火候，不超过剩余点数', async () => {
    const ctx = await newRestaurant(t, { patch: { attr_left: 3 } });
    const r = await t.game.growth.allocate(ctx, { cook: 2, cutting: 1, fire: 0 });
    expect(r.data).toMatchObject({ attrLeft: 0, attrs: { cook: 2, cutting: 1, fire: 0 } });
    await expect(t.game.growth.allocate(ctx, { cook: 1, cutting: 0, fire: 0 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'attrPoint', need: 1, have: 0 },
    });
  });
});

describe('加油（规格书 02 §2.5）', () => {
  it('1 银币 = 1 油，加满；停业的店恢复营业', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 5000, oil: 200, oil_max: 1000, state: 2, state_reason: 'no_oil' },
    });
    const r = await t.game.growth.refuel(ctx);
    expect(r.events).toEqual([
      { type: 'loss', kind: 'coin', num: 800 },
      { type: 'gain', kind: 'oil', num: 800 },
    ]);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({
      coin: 4200,
      oil: 1000,
      state: 1,
      state_reason: null,
    });
  });
  it('银币不够加满时有多少加多少，停业的店照样恢复营业（避免停业后永远开不了店）', async () => {
    const poor = await newRestaurant(t, {
      patch: { coin: 10, oil: 0, oil_max: 1000, state: 2, state_reason: 'no_oil' },
    });
    await t.game.growth.refuel(poor);
    expect(await restRow(t, poor.restaurantId)).toMatchObject({ coin: 0, oil: 10, state: 1 });
  });
  it('油满了、一个银币都没有时报错', async () => {
    const full = await newRestaurant(t, { patch: { oil: 1000, oil_max: 1000 } });
    await expect(t.game.growth.refuel(full)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const broke = await newRestaurant(t, { patch: { coin: 0, oil: 0, oil_max: 1000 } });
    await expect(t.game.growth.refuel(broke)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
  });
});

describe('升星（规格书 02 §2.4、20 §20.5）', () => {
  it('13 级、15 道食谱、1 张凭证 → 1 星，得到一星礼包', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13 }, cookbooks: learned(15), goods: { 86: 1 } });
    const need = await t.game.growth.starNeed(ctx);
    expect(need).toMatchObject({ star: 0, nextStar: 1, available: true, ok: true });
    await t.game.growth.starUp(ctx);
    expect((await restRow(t, ctx.restaurantId)).star_level).toBe(1);
    expect(await goodsNum(t, ctx.restaurantId, 86)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 117)).toBe(1);
    const news = await t.db.selectFrom('news').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(news.map((n) => n.type)).toContain('star.up');
  });

  it('区服设了升星银币（240-1）：条件多一行银币；够时扣银币升星，不够报 NOT_ENOUGH 且凭证不扣（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ tuning: { growth: { starCoin: [50000] } } }) })
      .execute();
    const poor = await newRestaurant(t, {
      shardId,
      patch: { level: 13, coin: 49999 },
      cookbooks: learned(15),
      goods: { 86: 1 },
    });
    const need = await t.game.growth.starNeed(poor);
    expect(need.checks.at(-1)).toEqual({ key: 'coin', need: 50000, have: 49999, ok: false });
    expect(need.ok).toBe(false);
    await expect(t.game.growth.starUp(poor)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin' },
    });
    expect(await goodsNum(t, poor.restaurantId, 86)).toBe(1);
    const rich = await newRestaurant(t, {
      shardId,
      patch: { level: 13, coin: 60000 },
      cookbooks: learned(15),
      goods: { 86: 1 },
    });
    await t.game.growth.starUp(rich);
    const r = await restRow(t, rich.restaurantId);
    expect(r.star_level).toBe(1);
    expect(r.coin).toBe(10000); // 1 星奖励只有礼包 117（道具），不给银币
    expect(await goodsNum(t, rich.restaurantId, 86)).toBe(0);
  });

  it('等级不够、食谱不够、凭证不够分别报错', async () => {
    const low = await newRestaurant(t, { patch: { level: 12 }, cookbooks: learned(15), goods: { 86: 1 } });
    await expect(t.game.growth.starUp(low)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'level', need: 13, have: 12 },
    });
    const few = await newRestaurant(t, { patch: { level: 13 }, cookbooks: learned(14), goods: { 86: 1 } });
    await expect(t.game.growth.starUp(few)).rejects.toMatchObject({
      params: { reason: 'cookbooks', need: 15, have: 14 },
    });
    const noCert = await newRestaurant(t, { patch: { level: 13 }, cookbooks: learned(15) });
    await expect(t.game.growth.starUp(noCert)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 86 },
    });
  });

  it('七星之后的泛紫星级在当前版本不开放', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 110, star_level: 7 } });
    expect(await t.game.growth.starNeed(ctx)).toMatchObject({ nextStar: 8, available: false, ok: false });
    await expect(t.game.growth.starUp(ctx)).rejects.toMatchObject({ params: { reason: 'not_available' } });
  });
});

describe('油壶扩容（规格书 02 §2.5、20 §20.6）', () => {
  it('1 级：3 级餐厅、5000 银币、初级凭证 ×1 → 上限 1500', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 3, coin: 10000 }, goods: { 24: 1 } });
    await t.game.growth.oilExpand(ctx);
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ oil_level: 1, oil_max: 1500, coin: 5000 });
    expect(await goodsNum(t, ctx.restaurantId, 24)).toBe(0);
  });
  it('条件列表', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 2, coin: 100 } });
    const need = await t.game.growth.oilNeed(ctx);
    expect(need).toMatchObject({ oilLevel: 0, nextLevel: 1, nextOilMax: 1500, ok: false });
    expect(need.checks).toEqual([
      { key: 'level', need: 3, have: 2, ok: false },
      { key: 'star', need: 0, have: 0, ok: true },
      { key: 'coin', need: 5000, have: 100, ok: false },
      { key: 'goods', id: 24, need: 1, have: 0, ok: false },
    ]);
  });
});
