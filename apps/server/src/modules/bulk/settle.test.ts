import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { trader, wallet } from '../exchange/test';
import { closeDue, payOut } from './settle';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  t.clock.set(gameTime('2026-10-12', 20, 1));
});
afterAll(() => t.close());

const config = () => t.game.deps.config;
/** 一种三级稀有食材（不写死编号） */
const FOOD = () => [...config().foods.values()].find((f) => f.level === 3 && f.odds < 100 && !f.retired)!.id;
const CONSOLATION = () => config().tuning.bulk.consolation.goods;
const M = 1_000_000;
let dayN = 0;
const coin = async (id: number) => Number((await restRow(t, id)).coin);
const food = async (restId: number) => {
  const f = await foodNum(t, restId, FOOD());
  return f.num + f.fridge;
};

/** 直接造一批：收盘时刻已过 */
async function mkLot(shardId: number, o: { qty: number; group: number; cap?: number; reserve?: number }) {
  const now = t.clock.now;
  const r = await t.db
    .insertInto('bulk_lot')
    .values({
      shard_id: shardId,
      day: `2027-01-${String((++dayN % 28) + 1).padStart(2, '0')}`,
      foods_id: FOOD(),
      level: 3,
      qty: o.qty,
      reserve: o.reserve ?? 40_000,
      cap: o.cap ?? o.qty,
      group_qty: o.group,
      opens_at: new Date(now.getTime() - 86_400_000),
      ends_at: new Date(now.getTime() - 60_000),
      close_at: new Date(now.getTime() - 120_000),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
/** 直接造一条出价，并从店里扣掉冻结的钱（和出价一样） */
async function mkBid(lotId: string, shardId: number, restId: number, price: number, qty: number, s: number) {
  await t.db
    .insertInto('bulk_bid')
    .values({
      lot_id: lotId,
      rest_id: restId,
      shard_id: shardId,
      price,
      qty,
      frozen: price * qty,
      ranked_at: new Date(t.clock.now.getTime() - 3_600_000 + s * 1000),
      last_bid_at: new Date(t.clock.now.getTime() - 3_600_000 + s * 1000),
    })
    .execute();
  await t.db
    .updateTable('restaurant')
    .set((eb) => ({ coin: eb('coin', '-', price * qty) }))
    .where('id', '=', restId)
    .execute();
}
async function players(shardId: number, n: number, patch: Record<string, unknown> = {}) {
  const out: number[] = [];
  for (let i = 0; i < n; i++)
    out.push((await newRestaurant(t, { shardId, patch: { coin: M, ...patch } })).restaurantId);
  return out;
}
const settle = async (shardId: number) => {
  await closeDue(t.game.deps, shardId, t.clock.now);
  return payOut(t.game.deps, shardId, t.clock.now);
};
const lotRow = (id: string) =>
  t.db.selectFrom('bulk_lot').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const news = (shardId: number) =>
  t.db
    .selectFrom('news')
    .selectAll()
    .where('shard_id', '=', shardId)
    .where('type', '=', 'bulk.deal')
    .execute();

describe('收盘结算（大宗认购设计 §1.4）', () => {
  it('设计 §1.5 的例子：成交价 53,000；甲~戊各中 2 份、多冻结的退回；己落选全额退回、得安慰奖；发新闻', async () => {
    const shardId = await createShard(t.db);
    const lot = await mkLot(shardId, { qty: 10, group: 3, cap: 2 });
    const ids = await players(shardId, 6);
    const prices = [60_000, 58_000, 56_000, 55_000, 53_000, 52_000];
    for (let i = 0; i < 6; i++) await mkBid(lot, shardId, ids[i]!, prices[i]!, 2, i);
    expect(await settle(shardId)).toEqual({ done: 6, failed: 0 });
    expect(await lotRow(lot)).toMatchObject({ status: 'settled', price: 53_000, sold: 10 });
    for (const id of ids.slice(0, 5)) {
      expect(await coin(id)).toBe(M - 106_000);
      expect(await food(id)).toBe(2);
      expect(await goodsNum(t, id, CONSOLATION())).toBe(0);
    }
    expect(await coin(ids[5]!)).toBe(M);
    expect(await food(ids[5]!)).toBe(0);
    expect(await goodsNum(t, ids[5]!, CONSOLATION())).toBe(1);
    const b = await t.db
      .selectFrom('bulk_bid')
      .selectAll()
      .where('rest_id', '=', ids[0]!)
      .executeTakeFirstOrThrow();
    expect(b).toMatchObject({ won: 2, paid: 106_000, refunded: 14_000, consolation: false });
    const n = await news(shardId);
    expect(n).toHaveLength(1);
    expect(n[0]!.params).toMatchObject({ foodsId: FOOD(), sold: 10, price: 53_000, demand: 12, qty: 10 });
  });

  it('边界上的人部分入围：只付入围的份数，其余退回，不发安慰奖（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const lot = await mkLot(shardId, { qty: 5, group: 2 });
    const [a, b] = await players(shardId, 2);
    await mkBid(lot, shardId, a!, 60_000, 3, 1);
    await mkBid(lot, shardId, b!, 55_000, 3, 2);
    await settle(shardId);
    expect(await lotRow(lot)).toMatchObject({ price: 55_000, sold: 5 });
    expect(await coin(b!)).toBe(M - 110_000);
    expect(await food(b!)).toBe(2);
    expect(await goodsNum(t, b!, CONSOLATION())).toBe(0);
    expect(await coin(a!)).toBe(M - 165_000);
  });

  it('不满 n 份但成团：按最低出价、全部入围（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const lot = await mkLot(shardId, { qty: 10, group: 3 });
    const [a, b] = await players(shardId, 2);
    await mkBid(lot, shardId, a!, 60_000, 2, 1);
    await mkBid(lot, shardId, b!, 58_000, 2, 2);
    await settle(shardId);
    expect(await lotRow(lot)).toMatchObject({ status: 'settled', price: 58_000, sold: 4 });
    expect(await coin(a!)).toBe(M - 116_000);
    expect(await coin(b!)).toBe(M - 116_000);
  });

  it('流拍：全额退回、没有安慰奖、没有新闻（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const lot = await mkLot(shardId, { qty: 10, group: 3 });
    const [a] = await players(shardId, 1);
    await mkBid(lot, shardId, a!, 60_000, 2, 1);
    await settle(shardId);
    expect(await lotRow(lot)).toMatchObject({ status: 'failed', sold: 0, price: null });
    expect(await coin(a!)).toBe(M);
    expect(await goodsNum(t, a!, CONSOLATION())).toBe(0);
    expect(await news(shardId)).toEqual([]);
  });

  it('安慰奖只给出价不低于成交价 90% 的落选者', async () => {
    const shardId = await createShard(t.db);
    const lot = await mkLot(shardId, { qty: 2, group: 1 });
    const [a, b, c] = await players(shardId, 3);
    await mkBid(lot, shardId, a!, 53_000, 2, 1);
    await mkBid(lot, shardId, b!, 47_000, 1, 2);
    await mkBid(lot, shardId, c!, 48_000, 1, 3);
    await settle(shardId);
    expect(await goodsNum(t, b!, CONSOLATION())).toBe(0);
    expect(await goodsNum(t, c!, CONSOLATION())).toBe(1);
  });

  it('橱柜和冰箱都放不下：多出的进交易所账户', async () => {
    const shardId = await createShard(t.db);
    const lot = await mkLot(shardId, { qty: 5, group: 1 });
    // 橱柜唯一一格被别的食材占着，每种最多 2 个：中的 5 份里 2 份进冰箱，3 份进账户（同期货交割测试）
    const other = [...config().foods.values()].find((f) => f.level === 1 && f.id !== FOOD())!.id;
    const a = (
      await newRestaurant(t, {
        shardId,
        patch: { coin: M, cupboard_num: 1, foods_max_num: 2 },
        foods: { [other]: 1 },
      })
    ).restaurantId;
    await mkBid(lot, shardId, a, 50_000, 5, 1);
    await settle(shardId);
    expect(await food(a)).toBe(2);
    expect((await wallet(t, a)).foods[FOOD()]).toBe(3);
    expect(await coin(a)).toBe(M - 250_000);
  });

  it('重跑不重复结算；某家失败下一轮只补这一家（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const lot = await mkLot(shardId, { qty: 4, group: 1 });
    const [a, b] = await players(shardId, 2);
    await mkBid(lot, shardId, a!, 50_000, 2, 1);
    await mkBid(lot, shardId, b!, 50_000, 2, 2);
    // 让 b 这一条出不了账：冻结的钱比要付的少（数据坏了），结算第二段拒绝处理它
    await t.db.updateTable('bulk_bid').set({ frozen: 0 }).where('rest_id', '=', b!).execute();
    expect(await closeDue(t.game.deps, shardId, t.clock.now)).toBe(1);
    expect(await closeDue(t.game.deps, shardId, t.clock.now)).toBe(0);
    expect(await payOut(t.game.deps, shardId, t.clock.now)).toEqual({ done: 1, failed: 1 });
    expect(await coin(a!)).toBe(M - 100_000);
    await t.db.updateTable('bulk_bid').set({ frozen: 100_000 }).where('rest_id', '=', b!).execute();
    expect(await payOut(t.game.deps, shardId, t.clock.now)).toEqual({ done: 1, failed: 0 });
    expect(await payOut(t.game.deps, shardId, t.clock.now)).toEqual({ done: 0, failed: 0 });
    expect(await coin(a!)).toBe(M - 100_000);
    expect(await coin(b!)).toBe(M - 100_000);
    expect(await food(a!)).toBe(2);
    expect(await food(b!)).toBe(2);
  });

  it('出价和收盘同时发生：要么出价算进结算，要么出价被拒、不扣钱', async () => {
    const shardId = await createShard(t.db);
    const lotId = await mkLot(shardId, { qty: 4, group: 1 });
    // 让出价时的检查以为还没到收盘（服务按时钟判断），结算按更晚的时刻跑
    await t.db
      .updateTable('bulk_lot')
      .set({ close_at: new Date(t.clock.now.getTime() + 1000) })
      .where('id', '=', lotId)
      .execute();
    const r = await trader(t, { shardId, coin: M });
    const [bidRes, closed] = await Promise.allSettled([
      t.game.bulk.bid(r, { lotId: Number(lotId), price: 50_000, qty: 2 }),
      closeDue(t.game.deps, shardId, new Date(t.clock.now.getTime() + 2000)),
    ]);
    expect(closed.status).toBe('fulfilled');
    await payOut(t.game.deps, shardId, t.clock.now);
    const lot = await lotRow(lotId);
    if (bidRes.status === 'fulfilled') {
      expect(lot).toMatchObject({ status: 'settled', sold: 2 });
      expect(await coin(r.restaurantId)).toBe(M - 100_000);
    } else {
      expect(lot.status).toBe('failed');
      expect(await coin(r.restaurantId)).toBe(M);
    }
  });
});
