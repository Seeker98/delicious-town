import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { trader } from '../exchange/test';
import { openLot } from './open';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-10-12', 20, 1)));

const svc = () => t.game.bulk;
const M = 1_000_000;
const coin = async (id: number) => Number((await restRow(t, id)).coin);
/** 开一批，再把份数、上限、成团、起拍价、收盘时刻改成好算的数 */
async function lotIn(shardId: number) {
  expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('opened');
  const lot = await t.db
    .updateTable('bulk_lot')
    .set({
      qty: 10,
      cap: 4,
      group_qty: 3,
      reserve: 50_000,
      close_at: new Date(t.clock.now.getTime() + 3_600_000),
    })
    .where('shard_id', '=', shardId)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { ...lot, id: Number(lot.id) };
}
const bid = (r: RestCtx, lotId: number, price: number, qty: number) => svc().bid(r, { lotId, price, qty });
const row = (lotId: number, restId: number) =>
  t.db
    .selectFrom('bulk_bid')
    .selectAll()
    .where('lot_id', '=', String(lotId))
    .where('rest_id', '=', restId)
    .executeTakeFirst();
const later = (s: number) => t.clock.advance(s * 1000);

describe('出价（大宗认购设计 §1.2）', () => {
  it('第一次出价冻结单价 × 份数；看板里认购份数和我的入围份数对', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const r = await trader(t, { shardId, coin: 20 * M });
    const res = await bid(r, lot.id, 60_000, 3);
    expect(await coin(r.restaurantId)).toBe(20 * M - 180_000);
    expect(await row(lot.id, r.restaurantId)).toMatchObject({ price: 60_000, qty: 3, frozen: 180_000 });
    expect(res.data.lot).toMatchObject({
      demand: 3,
      bidders: 1,
      grouped: true,
      price: 60_000,
      threshold: 50_000,
    });
    expect(res.data.mine).toMatchObject({
      price: 60_000,
      qty: 3,
      frozen: 180_000,
      won: 3,
      estimate: 180_000,
    });
    expect(res.data.coin).toBe(20 * M - 180_000);
    expect((await svc().view(r)).coin).toBe(20 * M - 180_000);
  });

  it('改出价只补冻差额；降价、减份数、没改报 bulk_shrink；加价不到 1% 报 bulk_raise；超上限、低于起拍价报错', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const r = await trader(t, { shardId, coin: 20 * M });
    await expect(bid(r, lot.id, 49_999, 1)).rejects.toMatchObject({
      params: { reason: 'bulk_reserve', reserve: 50_000 },
    });
    await expect(bid(r, lot.id, 50_000, 5)).rejects.toMatchObject({ params: { what: 'bulk_cap', max: 4 } });
    await bid(r, lot.id, 50_000, 2);
    later(5);
    await expect(bid(r, lot.id, 50_000, 1)).rejects.toMatchObject({ params: { reason: 'bulk_shrink' } });
    await expect(bid(r, lot.id, 49_000, 3)).rejects.toMatchObject({ params: { reason: 'bulk_shrink' } });
    await expect(bid(r, lot.id, 50_000, 2)).rejects.toMatchObject({ params: { reason: 'bulk_shrink' } });
    await expect(bid(r, lot.id, 50_400, 2)).rejects.toMatchObject({
      params: { reason: 'bulk_raise', min: 50_500 },
    });
    await bid(r, lot.id, 50_500, 3);
    expect(await coin(r.restaurantId)).toBe(20 * M - 151_500);
    expect(await row(lot.id, r.restaurantId)).toMatchObject({ price: 50_500, qty: 3, frozen: 151_500 });
    // 只加份数不加价：不受 1% 限制
    later(5);
    await bid(r, lot.id, 50_500, 4);
    expect(await coin(r.restaurantId)).toBe(20 * M - 202_000);
  });

  it('冷却：5 秒内再出价报 bulk_cooldown 带要等几秒；过了就可以', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const r = await trader(t, { shardId, coin: 20 * M });
    await bid(r, lot.id, 50_000, 1);
    later(2);
    await expect(bid(r, lot.id, 60_000, 1)).rejects.toMatchObject({
      params: { reason: 'bulk_cooldown', wait: 3 },
    });
    expect((await svc().view(r)).mine?.cooldownLeft).toBe(3);
    later(3);
    await bid(r, lot.id, 60_000, 1);
  });

  it('过了收盘时刻、结算还没跑：报 bulk_closed，不扣钱，出价不变（Review Focus 1）', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const r = await trader(t, { shardId, coin: 20 * M });
    await bid(r, lot.id, 50_000, 1);
    t.clock.set(new Date(lot.close_at.getTime()));
    await expect(bid(r, lot.id, 60_000, 2)).rejects.toMatchObject({ params: { reason: 'bulk_closed' } });
    expect(await coin(r.restaurantId)).toBe(20 * M - 50_000);
    expect(await row(lot.id, r.restaurantId)).toMatchObject({ price: 50_000, qty: 1 });
    const other = await trader(t, { shardId, coin: 20 * M });
    await expect(bid(other, lot.id, 60_000, 1)).rejects.toMatchObject({ params: { reason: 'bulk_closed' } });
  });

  it('银币不够什么都不扣；批次不存在报 bulk_not_open', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const r = await trader(t, { shardId, coin: 60_000 });
    await expect(bid(r, lot.id, 50_000, 2)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect(await coin(r.restaurantId)).toBe(60_000);
    expect(await row(lot.id, r.restaurantId)).toBeUndefined();
    await expect(bid(r, lot.id + 999_999, 50_000, 1)).rejects.toMatchObject({
      params: { reason: 'bulk_not_open' },
    });
  });

  it('门槛：等级不够、交易所冻结报错；区服关了 bulk 或 exchange 报 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const low = await trader(t, { shardId, coin: 20 * M });
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', low.restaurantId).execute();
    await expect(bid(low, lot.id, 50_000, 1)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'exchange_level' },
    });
    const frozen = await trader(t, { shardId, coin: 20 * M });
    await t.db
      .insertInto('exchange_freeze')
      .values({ rest_id: frozen.restaurantId, reason: 'test' })
      .execute();
    await expect(bid(frozen, lot.id, 50_000, 1)).rejects.toMatchObject({
      params: { reason: 'exchange_frozen' },
    });
    for (const feature of ['bulk', 'exchange']) {
      const sid = await createShard(t.db);
      const l = await lotIn(sid);
      await t.db
        .insertInto('shard_config')
        .values({ shard_id: sid, override: JSON.stringify({ features: { [feature]: false } }) })
        .execute();
      t.game.shards.invalidate(sid);
      const r = await trader(t, { shardId: sid, coin: 20 * M });
      await expect(bid(r, l.id, 50_000, 1)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    }
  });
});

describe('看板（大宗认购设计 §1.3）', () => {
  it('满 n 份时预计成交价是第 n 份、门槛 + 1；部分入围；返回里没有收盘时刻', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const a = await trader(t, { shardId, coin: 20 * M });
    const b = await trader(t, { shardId, coin: 20 * M });
    const c = await trader(t, { shardId, coin: 20 * M });
    await bid(a, lot.id, 60_000, 4);
    await bid(b, lot.id, 58_000, 4);
    const before = await svc().view(c);
    expect(before.lot).toMatchObject({ demand: 8, price: 58_000, threshold: 50_000 });
    await bid(c, lot.id, 55_000, 4);
    const v = await svc().view(c);
    expect(v.lot).toMatchObject({ demand: 12, bidders: 3, price: 55_000, threshold: 55_001, grouped: true });
    expect(v.mine).toMatchObject({ qty: 4, won: 2, estimate: 110_000 });
    const json = JSON.stringify(v);
    expect(json).not.toContain('closeAt');
    expect(json).not.toContain(lot.close_at.toISOString());
  });

  it('两家同价：先出价的入围；后出价的加价后排到前面（Review Focus 2）', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const a = await trader(t, { shardId, coin: 20 * M });
    const b = await trader(t, { shardId, coin: 20 * M });
    const c = await trader(t, { shardId, coin: 20 * M });
    await bid(a, lot.id, 60_000, 4);
    await bid(b, lot.id, 55_000, 4);
    later(1);
    await bid(c, lot.id, 55_000, 4);
    expect((await svc().view(b)).mine?.won).toBe(4);
    expect((await svc().view(c)).mine?.won).toBe(2);
    later(5);
    await bid(c, lot.id, 55_550, 4);
    expect((await svc().view(c)).mine?.won).toBe(4);
    expect((await svc().view(b)).mine?.won).toBe(2);
  });

  it('没有进行中的批次时 lot、mine 为空；带门槛和数值', async () => {
    const shardId = await createShard(t.db);
    const r = await trader(t, { shardId, coin: 20 * M });
    const v = await svc().view(r);
    expect(v).toMatchObject({
      enabled: true,
      blocked: null,
      lot: null,
      mine: null,
      recent: [],
      cooldownSec: 5,
      closeWindowMin: 5,
      openHour: 20,
    });
  });
});
