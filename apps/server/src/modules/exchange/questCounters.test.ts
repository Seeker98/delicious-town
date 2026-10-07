import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShardAllLevels as createShard, trader } from './test';
import { createTestGame, type TestGame } from '../../../test/game';
import { eventCount } from '../../../test/quests';
import { makerPrices, marketFloor } from './maker';
import { refPrice } from './ref';
import { isTradable, priceBand } from './rules';

/** 支线“交易所”的计数（问题记录 515 支线扩充）：和系统买卖、兜底价卖给系统、买卖稀有食材按个数 */
const ONE = [1, 1, 1, 1, 1, 1, 1];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const svc = () => t.game.exchange;
const tune = () => t.deps.config.tuning.exchange;
const day = () => gameDay(t.clock.now);
/** 6 级稀有食材：菜场不卖，系统买价 = 参考价 × 0.7，不是兜底价 */
const lv6 = () => [...t.deps.config.foods.values()].find((f) => f.level === 6 && f.odds < 100 && f.odds > 0)!;
/** 3 级会上特价货架的：系统收购价被封顶到挂单下限以下，是兜底价 */
const lv3 = () =>
  [...t.deps.config.foods.values()].find(
    (f) =>
      f.level === 3 && isTradable(f) && marketFloor(f, t.deps.config, t.deps.config.tuning.market) !== null,
  )!;
const count = (restId: number, key: string) => eventCount(t, restId, key);

describe('交易所支线的计数（问题记录 515）', () => {
  it('卖给系统记一次（不是兜底价时不记兜底）；之后从系统买记一次；稀有食材买卖都按个数记', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const ref = await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, day());
    const band = priceBand(ref, tune());
    const ask = makerPrices(ref, null, band, tune().maker, ref).ask;
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    await svc().place(s, { foodsId: f.id, side: 'sell', price: band.min, qty: 3 });
    expect(await count(s.restaurantId, 'exchange.system.sell')).toBe(1);
    expect(await count(s.restaurantId, 'exchange.system.floor')).toBe(0);
    expect(await count(s.restaurantId, 'exchange.rare.sell')).toBe(3);
    const b = await trader(t, { shardId, coin: 100_000_000 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: ask, qty: 2 });
    expect(await count(b.restaurantId, 'exchange.system.buy')).toBe(1);
    expect(await count(b.restaurantId, 'exchange.rare.buy')).toBe(2);
  });

  it('以兜底价卖给系统记“低价倒给系统”', async () => {
    const shardId = await createShard(t.db);
    const f = lv3();
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    const sys = (await svc().book(s, f.id)).bids.find((x) => x.system)!;
    expect(sys.floor).toBe(true);
    await svc().sellToSystem(s, { foodsId: f.id, qty: 2, price: sys.price });
    expect(await count(s.restaurantId, 'exchange.system.floor')).toBe(1);
    expect(await count(s.restaurantId, 'exchange.system.sell')).toBe(1);
    // 3 级普通食材不算稀有
    expect(await count(s.restaurantId, 'exchange.rare.sell')).toBe(f.odds < 100 ? 2 : 0);
  });

  it('玩家之间成交：挂单方、吃单方都按个数记稀有食材', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const ref = await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, day());
    const s = await trader(t, { shardId, coin: 0, foods: { [f.id]: 10 } });
    // 按参考价挂卖单：高于系统买价，不和系统成交；也不偏离参考价太多，不会被判可疑冻结（冻结的不计）
    await svc().place(s, { foodsId: f.id, side: 'sell', price: ref, qty: 4 });
    expect(await count(s.restaurantId, 'exchange.rare.sell')).toBe(0);
    const b = await trader(t, { shardId, coin: 100_000_000 });
    await svc().place(b, { foodsId: f.id, side: 'buy', price: ref, qty: 4 });
    expect(await count(b.restaurantId, 'exchange.rare.buy')).toBe(4);
    expect(await count(s.restaurantId, 'exchange.rare.sell')).toBe(4);
    expect(await count(b.restaurantId, 'exchange.system.buy')).toBe(0);
  });
});
