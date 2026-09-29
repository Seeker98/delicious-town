import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime, hashSeed, latestSlot, seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';
import { rollShelf } from './rules';

const config = testConfig();
const t_ = config.tuning.market;
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const m = () => t.game.market;
const uniqueIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function openShelf(shardId: number, shelf: 0 | 1 | 2, hour = 10) {
  const now = gameTime('2026-09-30', hour);
  t.clock.set(now);
  await m().refresh(shardId, shelf, latestSlot(now, [hour]), now);
  const items = await t.db
    .selectFrom('market_item')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('shelf', '=', shelf)
    .execute();
  return items;
}

describe('日常菜场', () => {
  it('进货后可以买：扣银币、进橱柜、记限购；新闻', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const items = await openShelf(ctx.shardId, 0);
    expect(items).toHaveLength(5);
    const it0 = items[0]!;
    const price = config.requireFood(it0.foods_id).coin;
    t.clock.set(new Date(t.clock.now.getTime() + 60 * 60_000));
    await m().buy({ ...ctx, ip: uniqueIp() }, { itemId: it0.id, num: 10 });
    expect((await foodNum(t, ctx.restaurantId, it0.foods_id)).num).toBe(10);
    const coin = (await restRow(t, ctx.restaurantId)).coin;
    expect(1_000_000 - coin).toBeGreaterThanOrEqual(Math.ceil(price * 10 * 0.5));
    const news = await t.db.selectFrom('news').selectAll().where('shard_id', '=', ctx.shardId).execute();
    expect(news.map((n) => n.type)).toContain('market.restock');
    const view = await m().view(ctx);
    expect(view.daily.find((x) => x.id === it0.id)).toMatchObject({ bought: 10, left: it0.stock - 10 });
  });

  it('卖完了报 SOLD_OUT；超过每人限购报 LIMIT_REACHED', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000_000, foods_max_num: 5000 } });
    const [item] = await openShelf(ctx.shardId, 0);
    t.clock.set(new Date(t.clock.now.getTime() + 60 * 60_000));
    await t.db
      .updateTable('market_item')
      .set({ sold: item!.stock - 1 })
      .where('id', '=', item!.id)
      .execute();
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 2 })).rejects.toMatchObject({
      code: 'SOLD_OUT',
    });
    await t.db.updateTable('market_item').set({ sold: 0 }).where('id', '=', item!.id).execute();
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1000 })).resolves.toBeTruthy();
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
    });
  });

  it('橱柜满了、没有这种食材时不能买', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000, cupboard_num: 1 }, foods: { 457: 1 } });
    const [item] = await openShelf(ctx.shardId, 0);
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({
      code: 'CUPBOARD_FULL',
    });
  });
});

describe('特价和高级菜场', () => {
  it('特价需要验证邮箱，每人每轮 1 份', async () => {
    const unverified = await newRestaurant(t, { patch: { coin: 100000 } });
    const [item] = await openShelf(unverified.shardId, 1);
    await expect(
      m().buy({ ...unverified, ip: uniqueIp() }, { itemId: item!.id, num: 1 }),
    ).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
    const ctx = await newRestaurant(t, {
      shardId: unverified.shardId,
      patch: { coin: 100000 },
      verified: true,
    });
    await m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 });
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
    });
  });

  it('同一 IP 两次买特价要间隔 10 分钟（按游戏时间）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 }, verified: true });
    const items = await openShelf(ctx.shardId, 1);
    const ip = uniqueIp();
    await m().buy({ ...ctx, ip }, { itemId: items[0]!.id, num: 1 });
    await expect(m().buy({ ...ctx, ip }, { itemId: items[1]!.id, num: 1 })).rejects.toMatchObject({
      code: 'COOLDOWN',
    });
    t.clock.advance(11 * 60_000);
    await m().buy({ ...ctx, ip }, { itemId: items[1]!.id, num: 1 });
  });

  it('特价购买在写入 IP 间隔之后失败回滚时，不占用这个 IP 的间隔', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100000 }, verified: true });
    const items = await openShelf(ctx.shardId, 1);
    const ip = uniqueIp();
    let failNext = true;
    t.deps.bus.on('action', async (_tx, e) => {
      if (failNext && e.restId === ctx.restaurantId && e.payload?.key === 'market.buy') {
        failNext = false;
        throw new Error('boom');
      }
    });
    await expect(m().buy({ ...ctx, ip }, { itemId: items[0]!.id, num: 1 })).rejects.toThrow('boom');
    await m().buy({ ...ctx, ip }, { itemId: items[0]!.id, num: 1 });
  });

  it('同一个 IP 的两家店同时抢特价：最多成功一个，不超卖（Review Focus 1）', async () => {
    const a = await newRestaurant(t, { patch: { coin: 100000 }, verified: true });
    const b = await newRestaurant(t, { shardId: a.shardId, patch: { coin: 100000 }, verified: true });
    const [item] = await openShelf(a.shardId, 1);
    const ip = uniqueIp();
    const results = await Promise.allSettled([
      m().buy({ ...a, ip }, { itemId: item!.id, num: 1 }),
      m().buy({ ...b, ip }, { itemId: item!.id, num: 1 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(['LIMIT_REACHED', 'COOLDOWN']).toContain(failed.reason.code);
    const row = await t.db
      .selectFrom('market_item')
      .select('sold')
      .where('id', '=', item!.id)
      .executeTakeFirstOrThrow();
    expect(row.sold).toBe(1);
  });

  it('高级菜场需要爱心项链；价格 ×2', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const [item] = await openShelf(ctx.shardId, 2, 12);
    await expect(m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
    });
    await grantGoods(t.db, config, ctx.restaurantId, 167, 1, t.clock.now);
    const before = (await restRow(t, ctx.restaurantId)).coin;
    await m().buy({ ...ctx, ip: uniqueIp() }, { itemId: item!.id, num: 1 });
    const food = config.requireFood(item!.foods_id);
    const snap = await t.game.world.ensure(ctx.shardId);
    const expected = Math.ceil(food.coin * 2 * (1 + (snap.weather.effects.marketCoin ?? 0)));
    expect(before - (await restRow(t, ctx.restaurantId)).coin).toBe(expected);
  });
});

describe('竞猜（规格书 06 §6.3）', () => {
  it('在 10:00:00 报名算进 12 点那一轮（Review Focus 2）；花 2 张神秘礼券；每轮一次', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 5 } });
    t.clock.set(gameTime('2026-09-30', 10));
    const r = await m().joinGuess(ctx, [238, 240]);
    expect(r.data.period).toBe('2026-09-30@12');
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(3);
    await expect(m().joinGuess(ctx, [238])).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('开奖：猜中 3 种得幸运饼干 ×3 + 三级食材兑换券 ×3；12 点猜中 5 种再加 15 蟹币', async () => {
    const three = await newRestaurant(t, { goods: { 1: 5 } });
    const five = await newRestaurant(t, { shardId: three.shardId, goods: { 1: 5 } });
    const slot = latestSlot(gameTime('2026-09-30', 12), t_.dailyHours);
    const opened = rollShelf(
      0,
      12,
      config,
      t_,
      seededRng(hashSeed(three.shardId, 'market', 0, slot.key)),
    ).map((x) => x.foodsId);
    const wrong = config.bundle.marketGuessFoods.filter((id) => !opened.includes(id));
    t.clock.set(gameTime('2026-09-30', 11));
    await m().joinGuess(three, [...opened.slice(0, 3), ...wrong.slice(0, 2)]);
    await m().joinGuess(five, opened.slice(0, 5));
    t.clock.set(slot.start);
    await m().refresh(three.shardId, 0, slot, slot.start);
    expect(await goodsNum(t, three.restaurantId, 491)).toBe(3);
    expect(await goodsNum(t, three.restaurantId, 243)).toBe(3);
    expect(await goodsNum(t, three.restaurantId, 240)).toBe(0);
    expect(await goodsNum(t, five.restaurantId, 491)).toBe(5);
    expect(await goodsNum(t, five.restaurantId, 245)).toBe(5);
    expect(await goodsNum(t, five.restaurantId, 240)).toBe(15);
    const g = await t.db
      .selectFrom('market_guess')
      .selectAll()
      .where('rest_id', '=', five.restaurantId)
      .executeTakeFirstOrThrow();
    expect(g).toMatchObject({ hits: 5 });
    t.clock.set(new Date());
  });

  it('worker 停机错过了报名那一轮：下次日常刷新时退还神秘礼券并标记已结算', async () => {
    const ctx = await newRestaurant(t, { goods: { 1: 5 } });
    t.clock.set(gameTime('2026-09-30', 9, 30));
    const r = await m().joinGuess(ctx, [238, 240]);
    expect(r.data.period).toBe('2026-09-30@10');
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(3);
    const slot = latestSlot(gameTime('2026-09-30', 12), t_.dailyHours);
    t.clock.set(slot.start);
    await m().refresh(ctx.shardId, 0, slot, slot.start);
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(5);
    const g = await t.db
      .selectFrom('market_guess')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(g.settled_at).not.toBeNull();
    expect(g.hits).toBeNull();
    t.clock.set(new Date());
  });
});
