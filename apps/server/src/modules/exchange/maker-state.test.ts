import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { incrementDaily } from '../counter/dailyCounter';
import { addBought, addStock, makerQuote, makerState, TO_SYSTEM } from './maker';
import { initialRef } from './rules';
import { trader } from './test';

/** 各等级价格倍数全 1（240-1 默认值） */
const ONE = [1, 1, 1, 1, 1, 1, 1];

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
    expect(await makerQuote(t.db, x)).toEqual({ bid: { price: 700, qty: 20, floor: false }, ask: null });
    await incrementDaily(t.db, r.restaurantId, TO_SYSTEM, 15, day);
    await addStock(t.db, shardId, f.id, 4);
    expect(await makerQuote(t.db, x)).toEqual({
      bid: { price: 700, qty: 5, floor: false },
      ask: { price: 1300, qty: 4 },
    });
    const off = {
      ...x.tuning,
      exchange: { ...x.tuning.exchange, maker: { ...x.tuning.exchange.maker, enabled: false } },
    };
    expect(await makerQuote(t.db, { ...x, tuning: off })).toEqual({ bid: null, ask: null });
  });
  it('参考价被推高：1.3 倍时系统买价仍按初始参考价 × 0.7；1.8 倍时下限已高过它，变成兜底价、价格不变（终审 C1、问题记录 244）', async () => {
    const shardId = await createShard(t.db);
    const f = lv6();
    const r = await trader(t, { shardId });
    const base = initialRef(f, t.deps.config, ONE);
    const quote = (k: number) =>
      makerQuote(t.db, {
        config: t.deps.config,
        tuning: t.deps.config.tuning,
        shardId,
        foodsId: f.id,
        day: gameDay(t.clock.now),
        restId: r.restaurantId,
        ref: Math.round(base * k),
      });
    expect((await quote(1.3)).bid!.price).toBe(Math.floor(base * 0.7));
    expect((await quote(1.3)).bid!.floor).toBe(false);
    expect((await quote(1.8)).bid).toMatchObject({ price: Math.floor(base * 0.7), floor: true });
  });
});
