import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, latestSlot } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { grantGoods } from '../store/grant';
import { sellPrice } from '../store/rules';
import { GOODS, createGameConfig } from '@dt/config';
import { gid } from '../../../test/items';

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
    await shop().buy(ctx, { goodsId: gid('普通宣传海报'), num: 3 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(7000);
    expect(await goodsNum(t, ctx.restaurantId, gid('普通宣传海报'))).toBe(3);
    const l = await t.db.selectFrom('ledger').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(l.every((x) => x.source === 'shop.buy')).toBe(true);
  });
  it('没上架的不能买；仓库满了不能买新种类', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 100000, store_num: 1 },
      goods: { [GOODS.starCert]: 1 },
    });
    await expect(shop().buy(ctx, { goodsId: GOODS.mysteryTicket, num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_on_sale' },
    });
    await expect(shop().buy(ctx, { goodsId: gid('普通宣传海报'), num: 1 })).rejects.toMatchObject({
      code: 'STORE_FULL',
    });
    await shop().buy(ctx, { goodsId: GOODS.starCert, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.starCert)).toBe(2);
  });
  it('列表：银币商店和黑市', async () => {
    const ctx = await newRestaurant(t);
    const l = await shop().items(ctx);
    expect(l.coin.find((x) => x.goodsId === gid('普通宣传海报'))).toMatchObject({ price: 1000 });
    expect(l.black.find((x) => x.goodsId === GOODS.starCert)).toMatchObject({ price: 5 });
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
    await shop().buyBlack(ctx, { goodsId: GOODS.starCert, num: 2 });
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(10);
  });
  it('出售 = 单价 × 数量 × 0.7；勋章不能卖；牌匾至少留 1 个', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 0 },
      goods: { [gid('普通宣传海报')]: 2, [gid('[新春牌匾]')]: 1 },
    });
    await shop().sell(ctx, { goodsId: gid('普通宣传海报'), num: 2 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1400);
    await expect(shop().sell(ctx, { goodsId: gid('[新春牌匾]'), num: 1 })).rejects.toMatchObject({
      params: { reason: 'keep_one_plaque' },
    });
    await grantGoods(t.db, config, ctx.restaurantId, GOODS.loveNecklace, 1, new Date());
    await expect(shop().sell(ctx, { goodsId: GOODS.loveNecklace, num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_sellable' },
    });
  });
  it('出售按页面上的单价 × 数量付银币，单价没有浮点误差（终审：确认框写的数要和到账一致）', async () => {
    // 爆裂飞弹 11,000 × 0.7 用浮点算是 7,699.999…，向下取整会少 1（原来用中扩建卡 45,000，问题记录 513 改价后换成它）
    expect(sellPrice(config.requireGoods(gid('爆裂飞弹')), config.tuning)).toBe(7_700);
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, goods: { [gid('爆裂飞弹')]: 3 } });
    await shop().sell(ctx, { goodsId: gid('爆裂飞弹'), num: 3 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(3 * 7_700);
  });
  it('只能丢弃升星促销勋章', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('普通宣传海报')]: 1 } });
    await grantGoods(t.db, config, ctx.restaurantId, GOODS.starPromoHonor, 1, new Date());
    await shop().discard(ctx, { goodsId: GOODS.starPromoHonor });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.starPromoHonor)).toBe(0);
    await expect(shop().discard(ctx, { goodsId: gid('普通宣传海报') })).rejects.toMatchObject({
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
    expect(item(l, 'coin', gid('普通宣传海报'))).toMatchObject({ maxBuy: 3, blocked: null });
    expect(item(l, 'coin', GOODS.starCert)).toMatchObject({ maxBuy: 0, blocked: 'money' });
    expect(item(l, 'black', GOODS.starCert)).toMatchObject({ maxBuy: 2, blocked: null });
  });

  it('受持有上限和单次 999 个限制；厨具一次只能买 1 件', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 1_000_000_000_000 },
      goods: { [gid('体力卡')]: 9998, [GOODS.essence]: 9999 },
    });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', gid('体力卡'))).toMatchObject({ maxBuy: 1, blocked: null });
    expect(item(l, 'coin', GOODS.essence)).toMatchObject({ maxBuy: 0, blocked: 'max' });
    expect(item(l, 'coin', gid('普通宣传海报'))).toMatchObject({ maxBuy: 999, blocked: null });
    expect(item(l, 'coin', gid('见习之铲'))).toMatchObject({ maxBuy: 1, blocked: null });
  });

  it('教师证（不可叠放、持有上限 1）已有 1 张时不能再买（问题记录 136）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000_000 }, goods: { [gid('初级教师证')]: 1 } });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', gid('初级教师证'))).toMatchObject({ maxBuy: 0, blocked: 'max' });
  });

  it('仓库满了：新种类为 0（store），已有的种类照常能买', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 1_000_000, store_num: 1 },
      goods: { [GOODS.starCert]: 1 },
    });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', gid('普通宣传海报'))).toMatchObject({ maxBuy: 0, blocked: 'store' });
    expect(item(l, 'coin', GOODS.starCert)).toMatchObject({ maxBuy: 18, blocked: null });
  });
});

describe('后期海报奖杯按星级可用（问题记录 146）', () => {
  it('3 星：列表标 star、能买 0 个、带需要星级；买的接口报星级不够，不扣钱', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000, star_level: 3 } });
    const l = await shop().items(ctx);
    expect(l.coin.find((x) => x.goodsId === gid('13 哥宣传海报'))).toMatchObject({
      maxBuy: 0,
      blocked: 'star',
      needStar: 4,
    });
    expect(l.coin.find((x) => x.goodsId === gid('普通宣传海报'))).not.toHaveProperty('needStar');
    await expect(shop().buy(ctx, { goodsId: gid('13 哥宣传海报'), num: 1 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 4, have: 3 },
    });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1_000_000);
  });

  it('每日特价抽到高档海报时也看星级：3 星买不了、不扣钱、不占库存（质量期 ②）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000, star_level: 3 } });
    const { tuning } = await t.game.shards.settings(ctx.shardId);
    const day = latestSlot(t.clock.now, [tuning.shop.specialHour]).day;
    await t.db
      .insertInto('shop_special')
      .values({
        shard_id: ctx.shardId,
        day,
        goods_id: gid('13 哥宣传海报'),
        discount: 0.5,
        tier_name: 'x',
        stock: 5,
      })
      .execute();
    await expect(shop().buySpecial(ctx, { num: 1 })).rejects.toMatchObject({
      params: { reason: 'star', need: 4, have: 3 },
    });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1_000_000);
    const row = await t.db
      .selectFrom('shop_special')
      .select('sold')
      .where('shard_id', '=', ctx.shardId)
      .executeTakeFirstOrThrow();
    expect(row.sold).toBe(0);
  });

  it('星级刚好够（4 星）就能买（Review Focus 1）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000, star_level: 4 } });
    const l = await shop().items(ctx);
    expect(l.coin.find((x) => x.goodsId === gid('13 哥宣传海报'))).toMatchObject({
      blocked: null,
      needStar: 4,
    });
    await shop().buy(ctx, { goodsId: gid('13 哥宣传海报'), num: 1 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(970_000);
    expect(await goodsNum(t, ctx.restaurantId, gid('13 哥宣传海报'))).toBe(1);
  });
});

describe('钻石黑市的星级门槛（backlog 146）', () => {
  // 黑市池里现在没有带星级的道具：拿一张要 6 星的海报放进黑市、标上钻石价
  const poster = gid('镇长宣传海报');
  const b = config.bundle;
  let g: TestGame;
  beforeAll(async () => {
    g = await createTestGame({
      config: createGameConfig({
        ...b,
        goods: b.goods.map((x) => (x.id === poster ? { ...x, diamond: 5 } : x)),
        shopPools: { ...b.shopPools, black: [...b.shopPools.black, poster] },
      }),
    });
  });
  afterAll(() => g.close());

  it('星级不够买不了，不扣钻石；够了能买', async () => {
    expect(g.deps.config.requireGoods(poster).needStar).toBe(6);
    const low = await newRestaurant(g, { patch: { diamond: 20, star_level: 5 } });
    await expect(g.game.shop.buyBlack(low, { goodsId: poster, num: 1 })).rejects.toMatchObject({
      params: { reason: 'star', need: 6, have: 5 },
    });
    expect((await restRow(g, low.restaurantId)).diamond).toBe(20);
    const high = await newRestaurant(g, { patch: { diamond: 20, star_level: 6 } });
    await g.game.shop.buyBlack(high, { goodsId: poster, num: 1 });
    expect(await goodsNum(g, high.restaurantId, poster)).toBe(1);
  });
});
