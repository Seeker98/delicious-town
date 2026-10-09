import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GOODS } from '@dt/config';
import { gameTime, latestSlot } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));
const m = () => t.game.market;

async function stockman(shardId?: number) {
  const ctx = await newRestaurant(t, {
    shardId: shardId ?? (await createShard(t.db)),
    patch: { coin: 10_000_000 },
  });
  await grantGoods(t.db, config, ctx.restaurantId, GOODS.marketJobHonor, 1, t.clock.now);
  return ctx;
}

async function manualItems(shardId: number, owner: number) {
  return t.db
    .selectFrom('market_item')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('owner_rest_id', '=', owner)
    .orderBy('id')
    .execute();
}

describe('菜场手动进货（设计文档 §2.5）', () => {
  it('没有菜场工作证被拒', async () => {
    const a = await newRestaurant(t, { patch: { coin: 10_000_000 } });
    await expect(m().manualStock(a)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'job_honor' },
    });
  });

  it('费用和声望随次数变化；4 种各 1000 份挂在日常货架；写新闻', async () => {
    const a = await stockman();
    const coins: number[] = [];
    const renowns: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = await restRow(t, a.restaurantId);
      const r = await m().manualStock(a);
      const after = await restRow(t, a.restaurantId);
      coins.push(before.coin - after.coin);
      renowns.push(after.renown - before.renown);
      expect(r.data.foods).toHaveLength(4);
      expect(new Set(r.data.foods).size).toBe(4);
    }
    expect(coins).toEqual([1e6, 1e6, 2e6]);
    expect(renowns).toEqual([50, 50, 200]);
    const items = await manualItems(a.shardId, a.restaurantId);
    expect(items).toHaveLength(4);
    expect(items.every((x) => x.shelf === 0 && x.stock === 1000 && x.sold === 0)).toBe(true);
    const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', a.shardId).execute();
    expect(news.filter((n) => n.type === 'market.manual')).toHaveLength(3);
  });

  it('再次进货只替换自己上一批，系统日常货不受影响；日常刷新时一起下架', async () => {
    const a = await stockman();
    const now = gameTime(DAY, 10);
    t.clock.set(now);
    await m().refresh(a.shardId, 0, latestSlot(now, [10]), now);
    await m().manualStock(a);
    await m().manualStock(a);
    const all = await t.db.selectFrom('market_item').selectAll().where('shard_id', '=', a.shardId).execute();
    expect(all.filter((x) => x.owner_rest_id === null)).toHaveLength(
      config.tuning.market.dailyKinds + config.tuning.market.dailyNewbieKinds,
    );
    expect(all.filter((x) => x.owner_rest_id === a.restaurantId)).toHaveLength(4);
    const later = gameTime(DAY, 12);
    t.clock.set(later);
    await m().refresh(a.shardId, 0, latestSlot(later, [12]), later);
    expect(await manualItems(a.shardId, a.restaurantId)).toHaveLength(0);
  });

  it('别人买：付日常价，进货人得 25%；每人累计 99 份', async () => {
    const owner = await stockman();
    const buyer = await newRestaurant(t, { shardId: owner.shardId, patch: { coin: 100_000_000 } });
    await m().manualStock(owner);
    const item = (await manualItems(owner.shardId, owner.restaurantId))[0]!;
    const o0 = (await restRow(t, owner.restaurantId)).coin;
    const b0 = (await restRow(t, buyer.restaurantId)).coin;
    await m().buy(buyer, { itemId: item.id, num: 10 });
    const paid = b0 - (await restRow(t, buyer.restaurantId)).coin;
    expect(paid).toBeGreaterThan(0);
    expect((await restRow(t, owner.restaurantId)).coin - o0).toBe(Math.floor(paid * 0.25));
    expect((await foodNum(t, buyer.restaurantId, item.foods_id)).num).toBe(10);
    // 进货人的动态：谁买的、分到多少银币（问题记录 553）
    const feed = await t.game.social.reads.feed(owner, { limit: 5 });
    expect(feed.items[0]).toMatchObject({
      type: 'market.share',
      params: {
        foodsId: item.foods_id,
        num: 10,
        by: buyer.restaurantId,
        byName: expect.any(String),
        coin: Math.floor(paid * 0.25),
      },
    });
    await m().buy(buyer, { itemId: item.id, num: 89 });
    const o1 = (await restRow(t, owner.restaurantId)).coin;
    await expect(m().buy(buyer, { itemId: item.id, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
    });
    expect((await restRow(t, owner.restaurantId)).coin).toBe(o1);
  });

  it('进货人自己买：免费，不受 99 份限制', async () => {
    const owner = await stockman();
    await m().manualStock(owner);
    const item = (await manualItems(owner.shardId, owner.restaurantId))[0]!;
    const c0 = (await restRow(t, owner.restaurantId)).coin;
    await m().buy(owner, { itemId: item.id, num: 150 });
    expect((await restRow(t, owner.restaurantId)).coin).toBe(c0);
    expect((await foodNum(t, owner.restaurantId, item.foods_id)).num).toBe(150);
    const after = await t.db
      .selectFrom('market_item')
      .select('sold')
      .where('id', '=', item.id)
      .executeTakeFirstOrThrow();
    expect(after.sold).toBe(150);
  });

  it('并发：两人同时买都成功、分成都到账；同一人并发超限只成一笔', async () => {
    const owner = await stockman();
    const b1 = await newRestaurant(t, { shardId: owner.shardId, patch: { coin: 100_000_000 } });
    const b2 = await newRestaurant(t, { shardId: owner.shardId, patch: { coin: 100_000_000 } });
    await m().manualStock(owner);
    const item = (await manualItems(owner.shardId, owner.restaurantId))[0]!;
    const o0 = (await restRow(t, owner.restaurantId)).coin;
    const rs = await Promise.allSettled([
      m().buy(b1, { itemId: item.id, num: 60 }),
      m().buy(b2, { itemId: item.id, num: 60 }),
    ]);
    expect(rs.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const paid = 2 * (100_000_000 - (await restRow(t, b1.restaurantId)).coin);
    expect((await restRow(t, owner.restaurantId)).coin - o0).toBe(2 * Math.floor((paid / 2) * 0.25));
    const same = await Promise.allSettled([
      m().buy(b1, { itemId: item.id, num: 30 }),
      m().buy(b1, { itemId: item.id, num: 30 }),
    ]);
    expect(same.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('页面：别人看到进货人和限购 99；自己看到手动进货按钮和本次费用', async () => {
    const owner = await stockman();
    const other = await newRestaurant(t, { shardId: owner.shardId });
    const v0 = await m().view(owner);
    expect(v0.manual).toEqual({ hasCard: true, cost: 1e6 });
    expect((await m().view(other)).manual).toEqual({ hasCard: false, cost: 1e6 });
    await m().manualStock(owner);
    await m().manualStock(owner);
    expect((await m().view(owner)).manual.cost).toBe(2e6);
    const name = (await restRow(t, owner.restaurantId)).name;
    const seen = (await m().view(other)).daily.filter((x) => x.owner !== null);
    expect(seen).toHaveLength(4);
    expect(seen[0]).toMatchObject({ owner: { restId: owner.restaurantId, name }, limit: 99 });
    const mine = (await m().view(owner)).daily.filter((x) => x.owner !== null);
    expect(mine[0]!.limit).toBe(1000);
  });
});
