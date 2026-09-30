import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

async function seedNum(restId: number, seedId: number) {
  const r = await t.db
    .selectFrom('rest_seed')
    .select('num')
    .where('rest_id', '=', restId)
    .where('seed_id', '=', seedId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

describe('种子（设计文档 §3.6，裁定 1、5）', () => {
  it('种子页：库存、商店（不卖 7 级）、兑换表、精华持有', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5000 }, goods: { 470: 7 } });
    await t.db.insertInto('rest_seed').values({ rest_id: ctx.restaurantId, seed_id: 3, num: 2 }).execute();
    const v = await t.game.yard.seeds(ctx);
    expect(v).toMatchObject({ stock: [{ seedId: 3, num: 2 }], essence: 7, coin: 5000 });
    expect(v.shop.open).toBe(true);
    expect(v.shop.items).toHaveLength(94);
    expect(v.shop.items[0]).toEqual({ seedId: 1, price: 1800 });
    expect(v.shop.items.some((x) => x.seedId === 95)).toBe(false);
    expect(v.exchange).toHaveLength(96);
    expect(v.exchange.find((x) => x.seedId === 95)).toEqual({ seedId: 95, seedNum: 1, essence: 30 });
  });

  it('买种子：花 单价 × 数量；7 级不卖；银币不够报错', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5000 } });
    expect((await t.game.yard.buySeed(ctx, { seedId: 1, num: 2 })).data).toEqual({ coin: 3600 });
    expect(await seedNum(ctx.restaurantId, 1)).toBe(2);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1400);
    await expect(t.game.yard.buySeed(ctx, { seedId: 95, num: 1 })).rejects.toMatchObject({
      params: { reason: 'seed_not_sold' },
    });
    await expect(t.game.yard.buySeed(ctx, { seedId: 1, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin' },
    });
  });

  it('种子商店关闭报 seed_shop_closed；调价后单价 = ⌈coin × 倍率⌉', async () => {
    const closed = await newRestaurant(t, { patch: { coin: 5000 } });
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: closed.shardId,
        override: JSON.stringify({ tuning: { yard: { seedShop: false } } }),
      })
      .execute();
    t.game.shards.invalidate(closed.shardId);
    await expect(t.game.yard.buySeed(closed, { seedId: 1, num: 1 })).rejects.toMatchObject({
      params: { reason: 'seed_shop_closed' },
    });
    expect((await t.game.yard.seeds(closed)).shop.open).toBe(false);
    const pricey = await newRestaurant(t, { patch: { coin: 5000 } });
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: pricey.shardId,
        override: JSON.stringify({ tuning: { yard: { seedPriceRate: 1.5 } } }),
      })
      .execute();
    t.game.shards.invalidate(pricey.shardId);
    expect((await t.game.yard.buySeed(pricey, { seedId: 1, num: 1 })).data).toEqual({ coin: 2700 });
  });

  it('兑换：扣 精华 × 次数，种子 + 每次数量 × 次数；精华不足一律不能换（裁定 5）', async () => {
    const ctx = await newRestaurant(t, { goods: { 470: 5 } });
    expect((await t.game.yard.exchangeSeed(ctx, { seedId: 1, times: 2 })).data).toEqual({ seeds: 10 });
    expect(await seedNum(ctx.restaurantId, 1)).toBe(10);
    expect(await goodsNum(t, ctx.restaurantId, 470)).toBe(1);
    await expect(t.game.yard.exchangeSeed(ctx, { seedId: 1, times: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 470, need: 2, have: 1 },
    });
    const broke = await newRestaurant(t);
    await expect(t.game.yard.exchangeSeed(broke, { seedId: 95, times: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
    });
    expect(await seedNum(broke.restaurantId, 95)).toBe(0);
  });
});
