import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, latestSlot } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { runDueJobs } from '../../worker/periodic';
import { grantGoods } from '../store/grant';
import { sellPrice } from '../store/rules';
import { FUND, GOODS, GOODS_TYPE, createGameConfig } from '@dt/config';
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
    // 道具价格迁移（2026-10-15）：普通宣传海报 5,000
    const ctx = await newRestaurant(t, { patch: { coin: 20000 } });
    await shop().buy(ctx, { goodsId: gid('普通宣传海报'), num: 3 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(5000);
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
    expect(l.coin.find((x) => x.goodsId === gid('普通宣传海报'))).toMatchObject({ price: 5000 });
    expect(l.black.find((x) => x.goodsId === GOODS.starCert)).toMatchObject({ price: 3 });
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
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(14);
  });
  it('出售 = 单价 × 数量 × 0.7；勋章不能卖；牌匾至少留 1 个', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 0 },
      goods: { [gid('普通宣传海报')]: 2, [gid('[新春牌匾]')]: 1 },
    });
    await shop().sell(ctx, { goodsId: gid('普通宣传海报'), num: 2 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(7000);
    await expect(shop().sell(ctx, { goodsId: gid('[新春牌匾]'), num: 1 })).rejects.toMatchObject({
      params: { reason: 'keep_one_plaque' },
    });
    await grantGoods(t.db, config, ctx.restaurantId, FUND.B, 1, new Date());
    await expect(shop().sell(ctx, { goodsId: FUND.B, num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_sellable' },
    });
  });
  it('出售单价没有浮点误差（终审：确认框写的数要和到账一致）', () => {
    // 11,000 × 0.7 用浮点算是 7,699.999…，向下取整会少 1；现有道具里这样的都有钻石价、按钻石封顶，所以去掉钻石价来测
    expect(sellPrice({ ...config.requireGoods(gid('爆裂飞弹')), diamond: 0 }, config.tuning)).toBe(7_700);
  });
  it('有钻石价的卖店价不超过 钻石价 × shop.diamondSellCoin（经济分析 2026-10-08：一番赏的钻石买鞋带卖店）', async () => {
    const sp = (name: string) => sellPrice(config.requireGoods(gid(name)), config.tuning);
    expect(config.tuning.shop.diamondSellCoin).toBe(2_000);
    expect(sp('鞋带')).toBe(2_000);
    // 道具价格迁移（2026-10-15）：中扩容卡 72 钻、神秘食谱 16 钻
    expect(sp('中扩容卡')).toBe(144_000);
    expect(sp('神秘食谱')).toBe(32_000);
    // 银币价 × 0.7 更低的照旧
    expect(sellPrice({ ...config.requireGoods(gid('鞋带')), coin: 1_000 }, config.tuning)).toBe(700);
    // 到账和页面上的单价一致
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, goods: { [gid('鞋带')]: 3 } });
    await shop().sell(ctx, { goodsId: gid('鞋带'), num: 3 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(3 * 2_000);
  });
  it('兑换券、随机劵、探险图、残卷碎片不能卖回商店，只能拿来用（经济分析 2026-10-08）', () => {
    // 残卷碎片：黑市买神秘食谱鉴定、残卷分解成碎片再卖，每颗钻石约合 5,000 银币（终审 I1）
    const shards = ['一', '二', '三', '四', '五', '六'].map((n) => `[${n}级]•残卷碎片`);
    for (const name of [
      '神秘食材兑换券',
      '神秘食材随机劵',
      '探险图',
      '高级探险图',
      '顶级探险图',
      '极品探险图',
      ...shards,
    ])
      expect(sellPrice(config.requireGoods(gid(name)), config.tuning), name).toBeNull();
  });
  it('黑市里能换银币的道具，换到的银币不超过 钻石价 × shop.diamondSellCoin（金币）', () => {
    for (const id of config.bundle.shopPools.black) {
      const g = config.requireGoods(id);
      if (g.use?.kind === 'currency')
        expect(g.use.coin, g.name).toBeLessThanOrEqual(g.diamond * config.tuning.shop.diamondSellCoin);
    }
  });
  it('蟹币不能卖回商店（用户 2026-10-08 定：100 张礼券换 1 个蟹币，原来能卖 35 万银币）', async () => {
    expect(sellPrice(config.requireGoods(GOODS.krabCoin), config.tuning)).toBeNull();
    const ctx = await newRestaurant(t, { goods: { [GOODS.krabCoin]: 1 } });
    await expect(shop().sell(ctx, { goodsId: GOODS.krabCoin, num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_sellable' },
    });
  });
  it('厨具、厨具精华不能卖回商店（2026-10-16：切磋刷厨具卖店）', async () => {
    const equips = config.bundle.goods.filter((g) => g.type === GOODS_TYPE.equip && g.coin > 0);
    expect(equips.length).toBeGreaterThan(10);
    for (const g of equips) expect(sellPrice(g, config.tuning), g.name).toBeNull();
    expect(sellPrice(config.requireGoods(GOODS.essence), config.tuning)).toBeNull();
    const ctx = await newRestaurant(t, { goods: { [GOODS.essence]: 3 } });
    await expect(shop().sell(ctx, { goodsId: GOODS.essence, num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_sellable' },
    });
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
    // 普通宣传海报 5,000；升星凭证银币 30,000、黑市 3 钻
    const ctx = await newRestaurant(t, { patch: { coin: 17500, diamond: 7 } });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', gid('普通宣传海报'))).toMatchObject({ maxBuy: 3, blocked: null });
    expect(item(l, 'coin', GOODS.starCert)).toMatchObject({ maxBuy: 0, blocked: 'money' });
    expect(item(l, 'black', GOODS.starCert)).toMatchObject({ maxBuy: 2, blocked: null });
  });

  it('受持有上限和单次 999 个限制；厨具一次只能买 1 件', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 1_000_000_000_000 },
      // 体力卡 2026-10-15 起不在银币商店卖，换成普通飞弹
      goods: { [gid('普通飞弹')]: 9998, [GOODS.essence]: 9999 },
    });
    const l = await shop().items(ctx);
    expect(item(l, 'coin', gid('普通飞弹'))).toMatchObject({ maxBuy: 1, blocked: null });
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
    expect(item(l, 'coin', GOODS.starCert)).toMatchObject({ maxBuy: 33, blocked: null });
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

  it('每日特价抽到限购的体力卡：和黑市共用每天 1 张的计数，超了不扣钱、不占库存（代码审查 2026-10-15）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10_000_000, diamond: 100 } });
    const { tuning } = await t.game.shards.settings(ctx.shardId);
    const day = latestSlot(t.clock.now, [tuning.shop.specialHour]).day;
    await t.db
      .insertInto('shop_special')
      .values({
        shard_id: ctx.shardId,
        day,
        goods_id: gid('体力卡'),
        discount: 0.1,
        tier_name: 'x',
        stock: 50,
      })
      .execute();
    await expect(shop().buySpecial(ctx, { num: 2 })).rejects.toMatchObject({
      params: { what: 'shop_daily', max: 1 },
    });
    await shop().buySpecial(ctx, { num: 1 });
    await expect(shop().buySpecial(ctx, { num: 1 })).rejects.toMatchObject({
      params: { what: 'shop_daily', max: 1 },
    });
    await expect(shop().buyBlack(ctx, { goodsId: gid('体力卡'), num: 1 })).rejects.toMatchObject({
      params: { what: 'shop_daily', max: 1 },
    });
    expect(await goodsNum(t, ctx.restaurantId, gid('体力卡'))).toBe(1);
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(100);
    const row = await t.db
      .selectFrom('shop_special')
      .select('sold')
      .where('shard_id', '=', ctx.shardId)
      .executeTakeFirstOrThrow();
    expect(row.sold).toBe(1);
  });

  it('当天的特价道具后来没有银币价了（节油器改版 30202 改成钻石货）：不显示、买不了、不扣钱（代码审查 2026-10-19）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const { tuning } = await t.game.shards.settings(ctx.shardId);
    const day = latestSlot(t.clock.now, [tuning.shop.specialHour]).day;
    expect(config.requireGoods(30202).coin).toBe(0);
    await t.db
      .insertInto('shop_special')
      .values({ shard_id: ctx.shardId, day, goods_id: 30202, discount: 0.5, tier_name: 'x', stock: 5 })
      .execute();
    expect(await shop().special(ctx)).toBeNull();
    await expect(shop().buySpecial(ctx, { num: 1 })).rejects.toMatchObject({
      params: { reason: 'not_on_sale' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 30202)).toBe(0);
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
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(960_000);
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

describe('每日限购（天气改版：晴雨签每天 1 个）', () => {
  it('买满当天的数就买不了，列表写剩几个；第二天重新算', async () => {
    t.clock.set(gameTime('2026-09-30', 12));
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const row = async () => (await shop().items(ctx)).coin.find((x) => x.goodsId === GOODS.weatherLots)!;
    expect(await row()).toMatchObject({ daily: { limit: 1, left: 1 }, maxBuy: 1, blocked: null });
    await expect(shop().buy(ctx, { goodsId: GOODS.weatherLots, num: 2 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
    });
    await shop().buy(ctx, { goodsId: GOODS.weatherLots, num: 1 });
    expect(await row()).toMatchObject({ daily: { limit: 1, left: 0 }, maxBuy: 0, blocked: 'daily' });
    await expect(shop().buy(ctx, { goodsId: GOODS.weatherLots, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'shop_daily', max: 1 },
    });
    t.clock.set(gameTime('2026-10-01', 12));
    await shop().buy(ctx, { goodsId: GOODS.weatherLots, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.weatherLots)).toBe(2);
  });
});

describe('限购：每天、每周，银币店和黑市共用计数（道具价格迁移 2026-10-15）', () => {
  it('体力卡只在黑市卖也每天限 1 张；小体力卡银币店买过，当天黑市也不能再买', async () => {
    expect(config.tuning.shop.dailyLimit).toEqual(
      expect.arrayContaining([
        [gid('小体力卡'), 1],
        [gid('体力卡'), 1],
      ]),
    );
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000, diamond: 100 } });
    await shop().buyBlack(ctx, { goodsId: gid('体力卡'), num: 1 });
    await expect(shop().buyBlack(ctx, { goodsId: gid('体力卡'), num: 1 })).rejects.toMatchObject({
      params: { what: 'shop_daily', max: 1 },
    });
    await shop().buy(ctx, { goodsId: gid('小体力卡'), num: 1 });
    await expect(shop().buyBlack(ctx, { goodsId: gid('小体力卡'), num: 1 })).rejects.toMatchObject({
      params: { what: 'shop_daily', max: 1 },
    });
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(100 - 16);
    const l = await shop().items(ctx);
    expect(l.black.find((x) => x.goodsId === gid('体力卡'))).toMatchObject({
      maxBuy: 0,
      blocked: 'daily',
      daily: { limit: 1, left: 0 },
    });
  });

  it('强化石每周限 2 块：买满后报 shop_weekly、列表标 weekly；下周一重新算', async () => {
    expect(config.tuning.shop.weeklyLimit).toEqual([[gid('强化石'), 2]]);
    const stone = gid('强化石');
    const ctx = await newRestaurant(t, { patch: { diamond: 1000 } });
    // 2026-10-14 是周三，2026-10-19 是下周一
    t.clock.set(gameTime('2026-10-14', 12));
    await shop().buyBlack(ctx, { goodsId: stone, num: 1 });
    await shop().buyBlack(ctx, { goodsId: stone, num: 1 });
    await expect(shop().buyBlack(ctx, { goodsId: stone, num: 1 })).rejects.toMatchObject({
      params: { what: 'shop_weekly', max: 2, used: 2 },
    });
    expect((await shop().items(ctx)).black.find((x) => x.goodsId === stone)).toMatchObject({
      maxBuy: 0,
      blocked: 'weekly',
      weekly: { limit: 2, left: 0 },
    });
    expect((await restRow(t, ctx.restaurantId)).diamond).toBe(1000 - 2 * 75);
    t.clock.set(gameTime('2026-10-19', 12));
    expect((await shop().items(ctx)).black.find((x) => x.goodsId === stone)).toMatchObject({
      maxBuy: 2,
      weekly: { limit: 2, left: 2 },
    });
    await shop().buyBlack(ctx, { goodsId: stone, num: 2 });
    expect(await goodsNum(t, ctx.restaurantId, stone)).toBe(4);
    t.clock.set(new Date());
  });
});
