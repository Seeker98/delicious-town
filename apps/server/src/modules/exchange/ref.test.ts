import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { refPrice, refPrices } from './ref';
import { fid } from '../../../test/items';

/** 各等级价格倍数全 1（240-1 默认值） */
const ONE = [1, 1, 1, 1, 1, 1, 1];

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
    expect(await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, day)).toBe(f.coin);
    const other = [...t.deps.config.foods.values()].filter((x) => x.odds < 100)[1]!;
    expect(
      await refPrice(
        t.db,
        t.deps.config,
        { ...tune(), refOverrides: { [String(other.id)]: 777 } },
        ONE,
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
    expect(await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, d0)).toBe(f.coin);
    const inD0 = new Date(t.clock.now.getTime());
    await trade(shardId, f.id, 100, 1, inD0);
    await trade(shardId, f.id, 200, 1, inD0);
    await trade(shardId, f.id, 300, 2, inD0);
    expect(await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, d1)).toBe(225);
    // d1 没有成交（不够 3 笔）：d2 沿用 225
    expect(await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, d2)).toBe(225);
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
    await refPrice(t.db, t.deps.config, tn, ONE, shardId, b, d0);
    for (const p of [100, 200, 300]) await trade(shardId, a, p, 1, new Date(t.clock.now.getTime()));
    const one = new Map<number, number>();
    for (const id of [a, b, c, e]) one.set(id, await refPrice(t.db, t.deps.config, tn, ONE, shardId, id, d1));
    // 换一个区服做同样的事，批量算
    const s2 = await createShard(t.db);
    await refPrice(t.db, t.deps.config, tn, ONE, s2, b, d0);
    for (const p of [100, 200, 300]) await trade(s2, a, p, 1, new Date(t.clock.now.getTime()));
    const bulk = await refPrices(t.db, t.deps.config, tn, ONE, s2, [a, b, c, e], d1);
    expect(bulk).toEqual(one);
    // 再调一次走"已保存"的路径，结果不变
    expect(await refPrices(t.db, t.deps.config, tn, ONE, s2, [a, b, c, e], d1)).toEqual(one);
  });
});

describe('问题记录 242：初始参考价用 initialRef', () => {
  it('雪蛤没有成交时参考价 6300（不是系统定价 9300），批量和逐个一致', async () => {
    const shardId = await createShard(t.db);
    const snow = [...t.deps.config.foods.values()].find((f) => f.name === '雪蛤')!;
    const day = gameDay(t.clock.now);
    expect(await refPrice(t.db, t.deps.config, tune(), ONE, shardId, snow.id, day)).toBe(6300);
    const s2 = await createShard(t.db);
    expect(
      (await refPrices(t.db, t.deps.config, tune(), ONE, s2, [snow.id, fid('四级万能食材')], day)).get(
        snow.id,
      ),
    ).toBe(6300);
    expect(
      (await refPrices(t.db, t.deps.config, tune(), ONE, s2, [snow.id, fid('四级万能食材')], day)).get(
        fid('四级万能食材'),
      ),
    ).toBe(8100);
  });
});
describe('系统成交不算参考价（156-3 设计 §2.4）', () => {
  it('前一天只有系统成交时，单个算和批量算都沿用原来的参考价', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const d0 = gameDay(t.clock.now);
    const d1 = addDays(d0, 1);
    const base = await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, d0);
    for (let i = 0; i < 5; i++)
      await t.db
        .insertInto('exchange_trade')
        .values({
          shard_id: shardId,
          foods_id: f.id,
          price: 1,
          qty: 10,
          buy_order_id: null,
          sell_order_id: null,
          buyer_rest_id: null,
          seller_rest_id: 0,
          fee: 0,
          created_at: t.clock.now,
          system: true,
        })
        .execute();
    expect(await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, d1)).toBe(base);
    const other = await createShard(t.db);
    await refPrice(t.db, t.deps.config, tune(), ONE, other, f.id, d0);
    await t.db
      .updateTable('exchange_trade')
      .set({ shard_id: other })
      .where('shard_id', '=', shardId)
      .execute();
    expect((await refPrices(t.db, t.deps.config, tune(), ONE, other, [f.id], d1)).get(f.id)).toBe(base);
  });
});

describe('中间有一天没生成参考价（backlog 156-1）', () => {
  it('d1 有成交、d2 没人打开：d3 先补算 d2（= d1 的均价），不跳过 d1 的成交；单个算和批量算一致', async () => {
    for (const batch of [false, true]) {
      const shardId = await createShard(t.db);
      const f = rare();
      const d0 = gameDay(t.clock.now);
      const [d1, d3] = [addDays(d0, 1), addDays(d0, 3)];
      const get = (day: string) =>
        batch
          ? refPrices(t.db, t.deps.config, tune(), ONE, shardId, [f.id], day).then((m) => m.get(f.id)!)
          : refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, day);
      expect(await get(d1)).toBe(f.coin);
      const inD1 = new Date(t.clock.now.getTime() + 86_400_000);
      await trade(shardId, f.id, 100, 1, inD1);
      await trade(shardId, f.id, 200, 1, inD1);
      await trade(shardId, f.id, 300, 2, inD1);
      // d2 没有人打开交易所，没保存参考价；d2 本身没有成交
      expect(await get(d3)).toBe(225);
      const saved = await t.db
        .selectFrom('exchange_ref')
        .select(['day', 'price'])
        .where('shard_id', '=', shardId)
        .where('foods_id', '=', f.id)
        .orderBy('day')
        .execute();
      expect(saved.map((r) => r.price)).toEqual([f.coin, 225, 225]);
    }
  });

  it('补算最多往前 7 天；更早的空档沿用最近一天保存的参考价', async () => {
    const shardId = await createShard(t.db);
    const f = rare();
    const d0 = gameDay(t.clock.now);
    expect(await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, d0)).toBe(f.coin);
    expect(await refPrice(t.db, t.deps.config, tune(), ONE, shardId, f.id, addDays(d0, 30))).toBe(f.coin);
    const n = await t.db
      .selectFrom('exchange_ref')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(1 + 8);
  });
});
