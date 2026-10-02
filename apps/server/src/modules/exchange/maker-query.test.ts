import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { makerPrices } from './maker';
import { refPrice } from './ref';
import { priceBand } from './rules';
import { trader } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const tune = () => t.deps.config.tuning.exchange;
const lv6 = () => [...t.deps.config.foods.values()].find((f) => f.level === 6 && f.odds < 100 && f.odds > 0)!;

describe('盘口和查询里的系统档（156-3 设计 §6）', () => {
  it('系统买档数量按看的人自己的剩余额度；有库存才有卖档（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const ref = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, gameDay(t.clock.now));
    const band = priceBand(ref, tune());
    const { bid: b0, ask } = makerPrices(ref, null, band, tune().maker);
    const bid = b0!;
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 30 } });
    const viewer = await trader(t, { shardId });
    let bk = await svc().book(viewer, f.id);
    expect(bk.bids).toEqual([{ price: bid, qty: 20, system: true }]);
    expect(bk.asks).toEqual([]);
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 20 });
    expect((await svc().book(s, f.id)).bids).toEqual([]);
    bk = await svc().book(viewer, f.id);
    expect(bk.bids).toEqual([{ price: bid, qty: 20, system: true }]);
    expect(bk.asks).toEqual([{ price: ask, qty: 20, system: true }]);
    expect(bk.volume).toBe(20);
    expect(bk.last).toBeNull();
    // 玩家挂单和系统同价时分成两档，系统在后
    const p = await trader(t, { shardId, coin: 50_000_000 });
    await svc().place(p, { foodsId: f.id, side: 'buy', price: bid, qty: 2 });
    await svc().place(p, { foodsId: f.id, side: 'buy', price: bid + 5, qty: 1 });
    expect((await svc().book(viewer, f.id)).bids).toEqual([
      { price: bid + 5, qty: 1, system: false },
      { price: bid, qty: 2, system: false },
      { price: bid, qty: 20, system: true },
    ]);
  });

  it('我的成交里系统成交标 system；列表的最新成交价不看系统成交', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const ref = await refPrice(t.db, t.deps.config, tune(), shardId, f.id, gameDay(t.clock.now));
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 5 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: priceBand(ref, tune()).min, qty: 2 });
    const me = await svc().me(s);
    expect(me.trades).toEqual([
      expect.objectContaining({ side: 'sell', qty: 2, system: true, fee: expect.any(Number) }),
    ]);
    const row = (await svc().foods(s)).find((x) => x.foodsId === f.id)!;
    expect(row).toMatchObject({ last: null, changePct: null });
  });
});
