import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { grantGoods } from './grant';
import { gid } from '../../../test/items';
import { GOODS } from '@dt/config';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('纪念品（148-2 设计 §6.2）', () => {
  it('不占仓库格：仓库满了也能领；仓库页格子数不算纪念品', async () => {
    const r = await newRestaurant(t, { patch: { store_num: 1 }, goods: { [GOODS.shortOilSaver]: 1 } });
    await grantGoods(t.db, t.deps.config, r.restaurantId, gid('小红旗徽章'), 2, new Date());
    expect(await goodsNum(t, r.restaurantId, gid('小红旗徽章'))).toBe(2);
    const view = await t.game.store.list(r, {});
    expect(view.kinds).toBe(1);
    // 仓库接口带上道具类型（问题记录 276）：前端按它分纪念品，不依赖可能过期的道具目录
    expect(view.items.find((i) => i.goodsId === gid('小红旗徽章'))).toMatchObject({
      usable: false,
      sellPrice: null,
      type: 10,
    });
  });
  it('不能卖、不能丢', async () => {
    const r = await newRestaurant(t, { goods: { [gid('新年铃铛')]: 1 } });
    await expect(t.game.shop.sell(r, { goodsId: gid('新年铃铛'), num: 1 })).rejects.toMatchObject({
      code: expect.any(String),
    });
    await expect(t.game.shop.discard(r, { goodsId: gid('新年铃铛') })).rejects.toMatchObject({
      params: { reason: 'not_discardable' },
    });
    expect(await goodsNum(t, r.restaurantId, gid('新年铃铛'))).toBe(1);
  });
});

describe('backlog 148-2：持有纪念品时不算仓库格', () => {
  it('商店买新种类：只算占格道具，纪念品不挡；格子真满了才报 STORE_FULL', async () => {
    // 仓库 2 格：一种普通道具 + 一种纪念品，还能再买一种新道具
    const r = await newRestaurant(t, {
      patch: { coin: 1_000_000, store_num: 2 },
      goods: { [gid('金币')]: 1, [gid('小红旗徽章')]: 1 },
    });
    await t.game.shop.buy(r, { goodsId: gid('见习之铲'), num: 1 });
    await expect(t.game.shop.buy(r, { goodsId: gid('见习之刀'), num: 1 })).rejects.toMatchObject({
      code: 'STORE_FULL',
    });
  });

  it('商店列表的"仓库满了"也不算纪念品', async () => {
    const r = await newRestaurant(t, {
      patch: { coin: 1_000_000, store_num: 2 },
      goods: { [gid('金币')]: 1, [gid('小红旗徽章')]: 1 },
    });
    const all = await t.game.shop.items(r);
    expect([...all.coin, ...all.black].some((i) => i.blocked === 'store')).toBe(false);
  });
});
