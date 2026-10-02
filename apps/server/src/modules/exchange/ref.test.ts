import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { refPrice } from './ref';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const rare = () => [...t.deps.config.foods.values()].find((f) => f.odds < 100)!;
const tune = () => t.deps.config.tuning.exchange;
async function trade(shardId: number, foodsId: number, price: number, qty: number, at: Date) {
  await t.db
    .insertInto('exchange_trade')
    .values({
      shard_id: shardId,
      foods_id: foodsId,
      price,
      qty,
      buy_order_id: null,
      sell_order_id: null,
      buyer_rest_id: 0,
      seller_rest_id: 0,
      fee: 0,
      created_at: at,
    })
    .execute();
}

describe('参考价（156-1 设计 §5）', () => {
  it('没有成交用系统定价；refOverrides 优先；算过的当天不变', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const day = gameDay(t.clock.now);
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, day)).toBe(f.coin);
    const other = [...t.deps.config.foods.values()].filter((x) => x.odds < 100)[1]!;
    expect(
      await refPrice(
        t.db,
        t.deps.config,
        { ...tune(), refOverrides: { [String(other.id)]: 777 } },
        shardId,
        other.id,
        day,
      ),
    ).toBe(777);
  });

  it('前一天成交够笔数用加权均价，不够沿用前一天的参考价', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const d0 = gameDay(t.clock.now);
    const d1 = addDays(d0, 1);
    const d2 = addDays(d0, 2);
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, d0)).toBe(f.coin);
    const inD0 = new Date(t.clock.now.getTime());
    await trade(shardId, f.id, 100, 1, inD0);
    await trade(shardId, f.id, 200, 1, inD0);
    await trade(shardId, f.id, 300, 2, inD0);
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, d1)).toBe(225);
    // d1 没有成交（不够 3 笔）：d2 沿用 225
    expect(await refPrice(t.db, t.deps.config, tune(), shardId, f.id, d2)).toBe(225);
  });
});
