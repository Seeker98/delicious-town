import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { refPrice, refPrices } from './ref';

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

describe('终审 I2：批量参考价和逐个算的结果一致', () => {
  it('有已保存的、前一天成交够笔数的、不够沿用的、没有任何记录的', async () => {
    const shardId = await createShard(t.db);
    const rares = [...t.deps.config.foods.values()].filter((f) => f.odds < 100).slice(0, 4);
    const [a, b, c, e] = rares.map((f) => f.id) as [number, number, number, number];
    const d0 = gameDay(t.clock.now);
    const d1 = addDays(d0, 1);
    const tn = { ...tune(), refOverrides: { [String(e)]: 4321 } };
    // a：d0 有 3 笔成交 → d1 用加权均价；b：d0 有参考价、没有成交 → d1 沿用；c：什么都没有 → 系统定价
    await refPrice(t.db, t.deps.config, tn, shardId, b, d0);
    for (const p of [100, 200, 300]) await trade(shardId, a, p, 1, new Date(t.clock.now.getTime()));
    const one = new Map<number, number>();
    for (const id of [a, b, c, e]) one.set(id, await refPrice(t.db, t.deps.config, tn, shardId, id, d1));
    // 换一个区服做同样的事，批量算
    const s2 = await createShard(t.db);
    await refPrice(t.db, t.deps.config, tn, s2, b, d0);
    for (const p of [100, 200, 300]) await trade(s2, a, p, 1, new Date(t.clock.now.getTime()));
    const bulk = await refPrices(t.db, t.deps.config, tn, s2, [a, b, c, e], d1);
    expect(bulk).toEqual(one);
    // 再调一次走"已保存"的路径，结果不变
    expect(await refPrices(t.db, t.deps.config, tn, s2, [a, b, c, e], d1)).toEqual(one);
  });
});
