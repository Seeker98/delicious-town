import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShardAllLevels as createShard, trader } from './test';
import { createTestGame, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { refPrice } from './ref';
import { isRare, isTradable } from './rules';

/** 普通食材上交易所（2026-10-22）：只在玩家之间成交，系统不收不卖，不算“买卖稀有食材” */
const ONE = [1, 1, 1, 1, 1, 1, 1];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const tune = () => t.deps.config.tuning.exchange;
const common = () =>
  [...t.deps.config.foods.values()].find(
    (f) => f.level === 3 && !isRare(f) && isTradable(f, tune().closedLevels),
  )!;

describe('普通食材上交易所（2026-10-22）', () => {
  it('盘口里没有系统的买价和卖价', async () => {
    const shardId = await createShard(t.db);
    const f = common();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    const book = await svc().book(s, f.id);
    expect(book.bids.some((x) => x.system)).toBe(false);
    expect(book.asks.some((x) => x.system)).toBe(false);
  });

  it('玩家之间能成交；挂得再低也不会卖给系统；不记“买卖稀有食材”', async () => {
    const shardId = await createShard(t.db);
    const f = common();
    const ref = await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, gameDay(t.clock.now));
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    const low = await svc().place(s, { foodsId: f.id, side: 'sell', price: ref, qty: 4 });
    expect(low.data.fills).toEqual([]);
    const b = await trader(t, { shardId, coin: 100_000_000 });
    const r = await svc().place(b, { foodsId: f.id, side: 'buy', price: ref, qty: 4 });
    expect(r.data.fills.reduce((a, x) => a + x.qty, 0)).toBe(4);
    expect(await eventCount(t, b.restaurantId, 'exchange.system.buy')).toBe(0);
    expect(await eventCount(t, b.restaurantId, 'exchange.rare.buy')).toBe(0);
    expect(await eventCount(t, s.restaurantId, 'exchange.rare.sell')).toBe(0);
  });
});
