import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, latestSlot } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const shop = () => t.game.shop;

describe('银币商店（规格书 06 §6.5）', () => {
  it('买 3 张普通宣传海报：扣银币、进仓库、写流水', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10000 } });
    await shop().buy(ctx, { goodsId: 13, num: 3 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(7000);
    expect(await goodsNum(t, ctx.restaurantId, 13)).toBe(3);
    const l = await t.db.selectFrom('ledger').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(l.every((x) => x.source === 'shop.buy')).toBe(true);
  });
  it('没上架的不能买；仓库满了不能买新种类', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000, store_num: 1 }, goods: { 86: 1 } });
    await expect(shop().buy(ctx, { goodsId: 1, num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_on_sale' },
    });
    await expect(shop().buy(ctx, { goodsId: 13, num: 1 })).rejects.toMatchObject({ code: 'STORE_FULL' });
    await shop().buy(ctx, { goodsId: 86, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, 86)).toBe(2);
  });
  it('列表：银币商店和黑市', async () => {
    const ctx = await newRestaurant(t);
    const l = await shop().items(ctx);
    expect(l.coin.find((x) => x.goodsId === 13)).toMatchObject({ price: 1000 });
    expect(l.black.find((x) => x.goodsId === 86)).toMatchObject({ price: 5 });
  });
});

describe('每日特价（规格书 06 §6.5、20 §20.9）', () => {
  it('12 点刷新：按固定种子抽商品和折扣档，发新闻；卖完为止', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000_000 } });
    t.clock.set(gameTime('2026-09-30', 12, 30));
    const deps = { db: t.db, shards: t.game.shards, now: () => t.clock.now, log: { error: () => {} } };
    await runDueJobs(deps, t.game.jobs, { shardIds: [ctx.shardId] });
    const sp = (await shop().special(ctx))!;
    expect(sp.day).toBe('2026-09-30');
    expect(config.bundle.shopPools.special).toContain(sp.goodsId);
    const g = config.requireGoods(sp.goodsId);
    expect(sp.price).toBe(Math.ceil(g.coin * sp.discount));
    await shop().buySpecial(ctx, { num: 1 });
    // 厨具买到后是实例（子项目 2B），不在仓库表里
    const pieces = await t.db
      .selectFrom('equip')
      .select('id')
      .where('rest_id', '=', ctx.restaurantId)
      .where('goods_id', '=', sp.goodsId)
      .execute();
    expect((await goodsNum(t, ctx.restaurantId, sp.goodsId)) + pieces.length).toBeGreaterThanOrEqual(1);
    await t.db
      .updateTable('shop_special')
      .set({ sold: sp.stock })
      .where('shard_id', '=', ctx.shardId)
      .execute();
    await expect(shop().buySpecial(ctx, { num: 1 })).rejects.toMatchObject({ code: 'SOLD_OUT' });
    t.clock.set(new Date());
  });
  it('12 点前看到的是前一天的特价', async () => {
    const ctx = await newRestaurant(t);
    await shop().rollSpecial(
      ctx.shardId,
      latestSlot(gameTime('2026-09-29', 12), [12]),
      gameTime('2026-09-29', 12),
    );
    t.clock.set(gameTime('2026-09-30', 11));
    expect((await shop().special(ctx))!.day).toBe('2026-09-29');
    t.clock.set(new Date());
  });
});

describe('黑市、出售、丢弃', () => {
  it('黑市用钻石买', async () => {
    const ctx = await newRestaurant(t, { patch: { diamond: 20 } });
    await shop().buyBlack(ctx, { goodsId: 86, num: 2 });
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(10);
  });
  it('出售 = 单价 × 数量 × 0.7；勋章不能卖；牌匾至少留 1 个', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, goods: { 13: 2, 174: 1 } });
    await shop().sell(ctx, { goodsId: 13, num: 2 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1400);
    await expect(shop().sell(ctx, { goodsId: 174, num: 1 })).rejects.toMatchObject({
      params: { reason: 'keep_one_plaque' },
    });
    await grantGoods(t.db, config, ctx.restaurantId, 167, 1, new Date());
    await expect(shop().sell(ctx, { goodsId: 167, num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_sellable' },
    });
  });
  it('只能丢弃升星促销勋章', async () => {
    const ctx = await newRestaurant(t, { goods: { 13: 1 } });
    await grantGoods(t.db, config, ctx.restaurantId, 87, 1, new Date());
    await shop().discard(ctx, { goodsId: 87 });
    expect(await goodsNum(t, ctx.restaurantId, 87)).toBe(0);
    await expect(shop().discard(ctx, { goodsId: 13 })).rejects.toMatchObject({
      params: { reason: 'not_discardable' },
    });
  });
});

describe('列表给出一次最多能买几个（问题记录：商店不显示最大可购买数量）', () => {
  const item = (
    l: Awaited<ReturnType<ReturnType<typeof shop>['items']>>,
    tab: 'coin' | 'black',
    id: number,
  ) => l[tab].find((x) => x.goodsId === id)!;

  it('受银币 / 钻石限制，买不起时给出原因', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 3500, diamond: 12 } });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', 13)).toMatchObject({ maxBuy: 3, blocked: null });
    expect(item(l, 'coin', 86)).toMatchObject({ maxBuy: 0, blocked: 'money' });
    expect(item(l, 'black', 86)).toMatchObject({ maxBuy: 2, blocked: null });
  });

  it('受持有上限和单次 999 个限制；厨具一次只能买 1 件', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000_000_000 }, goods: { 29: 9998, 52: 9999 } });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', 29)).toMatchObject({ maxBuy: 1, blocked: null });
    expect(item(l, 'coin', 52)).toMatchObject({ maxBuy: 0, blocked: 'max' });
    expect(item(l, 'coin', 13)).toMatchObject({ maxBuy: 999, blocked: null });
    expect(item(l, 'coin', 30)).toMatchObject({ maxBuy: 1, blocked: null });
  });

  it('仓库满了：新种类为 0（store），已有的种类照常能买', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000, store_num: 1 }, goods: { 86: 1 } });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', 13)).toMatchObject({ maxBuy: 0, blocked: 'store' });
    expect(item(l, 'coin', 86)).toMatchObject({ maxBuy: 18, blocked: null });
  });
});
