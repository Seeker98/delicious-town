import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { incrementDaily } from '../counter/dailyCounter';
import { addBought, addStock, makerQuote, makerState, TO_SYSTEM } from './maker';
import { trader } from './test';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const lv6 = () => [...t.deps.config.foods.values()].find((f) => f.level === 6 && f.odds < 100 && f.odds > 0)!;

describe('系统库存和每日收购（156-3 设计 §5）', () => {
  it('没有记录为 0；加减累计；库存不能减成负数', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const day = gameDay(t.clock.now);
    expect(await makerState(t.db, shardId, f.id, day)).toEqual({ stock: 0, bought: 0 });
    await addStock(t.db, shardId, f.id, 5);
    await addStock(t.db, shardId, f.id, -2);
    await addBought(t.db, shardId, f.id, day, 5);
    expect(await makerState(t.db, shardId, f.id, day)).toEqual({ stock: 3, bought: 5 });
    await expect(addStock(t.db, shardId, f.id, -4)).rejects.toThrow();
  });

  it('报价：买档数量扣掉这个玩家今天已卖的；没有库存没有卖档；关掉没有报价', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const day = gameDay(t.clock.now);
    const r = await trader(t, { shardId });
    const x = {
      config: t.deps.config,
      tuning: t.deps.config.tuning,
      shardId,
      foodsId: f.id,
      day,
      restId: r.restaurantId,
      ref: 1000,
    };
    expect(await makerQuote(t.db, x)).toEqual({ bid: { price: 700, qty: 20 }, ask: null });
    await incrementDaily(t.db, r.restaurantId, TO_SYSTEM, 15, day);
    await addStock(t.db, shardId, f.id, 4);
    expect(await makerQuote(t.db, x)).toEqual({ bid: { price: 700, qty: 5 }, ask: { price: 1300, qty: 4 } });
    const off = {
      ...x.tuning,
      exchange: { ...x.tuning.exchange, maker: { ...x.tuning.exchange.maker, enabled: false } },
    };
    expect(await makerQuote(t.db, { ...x, tuning: off })).toEqual({ bid: null, ask: null });
  });
});
