import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { trader } from '../exchange/test';
import { openLot } from './open';
import { freezeDue } from './service';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime('2026-10-12', 20, 1)));

const M = 1_000_000;
const MIN = 60_000;
const svc = () => t.game.bulk;
/** 开一批：10 份，起拍 50,000；名义结束在 2 小时后（默认最后 60 分钟停更） */
async function lotIn(shardId: number) {
  expect(await openLot(t.game.deps, shardId, t.clock.now)).toBe('opened');
  const now = t.clock.now.getTime();
  const lot = await t.db
    .updateTable('bulk_lot')
    .set({
      qty: 10,
      cap: 4,
      group_qty: 3,
      reserve: 50_000,
      ends_at: new Date(now + 120 * MIN),
      close_at: new Date(now + 118 * MIN),
    })
    .where('shard_id', '=', shardId)
    .returningAll()
    .executeTakeFirstOrThrow();
  return { ...lot, id: Number(lot.id) };
}

describe('大宗认购最后一段停更（问题记录 595）', () => {
  it('停更后看板停在进入停更那一刻：之后的出价不改变预计成交价、门槛、认购份数；我的入围情况不显示', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const a = await trader(t, { shardId, coin: 20 * M });
    const b = await trader(t, { shardId, coin: 20 * M });
    const c = await trader(t, { shardId, coin: 20 * M });
    await svc().bid(a, { lotId: lot.id, price: 60_000, qty: 4 });
    await svc().bid(b, { lotId: lot.id, price: 55_000, qty: 4 });
    const before = await svc().view(a);
    expect(before.lot).toMatchObject({ demand: 8, blindAt: null, price: 55_000 });
    expect(before.mine).toMatchObject({ won: 4, estimate: 220_000 });
    expect(before.blindMin).toBe(60);

    t.clock.set(new Date(lot.ends_at.getTime() - 59 * MIN));
    const res = await svc().bid(c, { lotId: lot.id, price: 70_000, qty: 4 });
    const blindStart = new Date(lot.ends_at.getTime() - 60 * MIN).toISOString();
    expect(res.data.lot).toMatchObject({
      demand: 8,
      bidders: 2,
      price: 55_000,
      threshold: 50_000,
      blindAt: blindStart,
    });
    expect(res.data.mine).toMatchObject({
      price: 70_000,
      qty: 4,
      frozen: 280_000,
      won: null,
      estimate: null,
    });
    const v = await svc().view(a);
    expect(v.lot).toMatchObject({ demand: 8, price: 55_000, blindAt: blindStart });
    expect(v.mine).toMatchObject({ won: null, estimate: null });
  });

  it('区服把停更设成 0：全程实时显示（回到原来的样子），已经写下的快照也不用', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const a = await trader(t, { shardId, coin: 20 * M });
    const b = await trader(t, { shardId, coin: 20 * M });
    await svc().bid(a, { lotId: lot.id, price: 60_000, qty: 4 });
    t.clock.set(new Date(lot.ends_at.getTime() - 30 * MIN));
    await svc().bid(b, { lotId: lot.id, price: 55_000, qty: 4 });
    expect((await svc().view(a)).lot).toMatchObject({ demand: 4 });
    await setTuning(t, shardId, { bulk: { ...t.game.deps.config.tuning.bulk, blindMin: 0 } });
    const v = await svc().view(a);
    expect(v.lot).toMatchObject({ demand: 8, blindAt: null });
    expect(v.mine).toMatchObject({ won: 4 });
    expect(v.blindMin).toBe(0);
  });

  it('每分钟的任务在进入停更后写快照，写过不再改；还没到停更的不写', async () => {
    const shardId = await createShard(t.db);
    const lot = await lotIn(shardId);
    const a = await trader(t, { shardId, coin: 20 * M });
    await svc().bid(a, { lotId: lot.id, price: 60_000, qty: 4 });
    expect(await freezeDue(t.game.deps, shardId, t.clock.now)).toBe(0);
    t.clock.set(new Date(lot.ends_at.getTime() - 60 * MIN));
    expect(await freezeDue(t.game.deps, shardId, t.clock.now)).toBe(1);
    expect(await freezeDue(t.game.deps, shardId, t.clock.now)).toBe(0);
    const row = await t.db
      .selectFrom('bulk_lot')
      .selectAll()
      .where('id', '=', String(lot.id))
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      blind_price: 60_000,
      blind_threshold: 50_000,
      blind_demand: 4,
      blind_bidders: 1,
    });
  });
});
