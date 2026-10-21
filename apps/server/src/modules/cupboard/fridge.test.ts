import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { fid } from '../../../test/items';
import type { RestCtx } from '../../core/deps';
import { runOp, runSystemOp } from '../../core/op';
import { addFoods } from './foods';
import { fridgeRound, settleFridge } from './fridge';
import { fridgeDailyFee, fridgeEntryFee, fridgeThawFee, fridgeTierMult, fridgeUnitPrice } from './fridgeFee';
import { streetNeeds } from './needs';

/** 冰箱收费（2026-10-22）：入库费、主动放冰箱、解冻先补欠费、每日仓储费和欠费抵债 */
const config = testConfig();
const tune = config.tuning;
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const c = () => t.game.cupboard;
const food = (name: string) => config.requireFood(fid(name));
const logsOf = async (restId: number, type: string) =>
  (
    await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', restId)
      .where('type', '=', type)
      .orderBy('id')
      .execute()
  ).map((x) => x.params as Record<string, unknown>);
const putFridge = (restId: number, rows: Array<[number, number, number?]>) =>
  t.db
    .insertInto('cupboard_food')
    .values(
      rows.map(([foodsId, fridge, num]) => ({
        rest_id: restId,
        foods_id: foodsId,
        num: num ?? 0,
        fridge_num: fridge,
      })),
    )
    .execute();
const settle = (ctx: RestCtx) =>
  runSystemOp(
    t.game.deps,
    ctx.shardId,
    ctx.restaurantId,
    { source: 'fridge.fee', now: t.clock.now },
    settleFridge,
  );
/** 1~2 级、没下架的食材，用来凑格数 */
const commons = () =>
  [...config.foods.values()].filter((f) => f.level <= 2 && !f.retired).sort((a, b) => a.id - b.id);

describe('费用计算', () => {
  it('分档：到了线整个冰箱乘倍数（1~20 ×1、21~40 ×1.5、41 起 ×2.25）', () => {
    expect(tune.cupboard.fridgeTiers).toEqual([
      [21, 1.5],
      [41, 2.25],
    ]);
    expect([0, 20, 21, 40, 41, 99].map((k) => fridgeTierMult(k, tune.cupboard.fridgeTiers))).toEqual([
      1, 1, 1.5, 1.5, 2.25, 2.25,
    ]);
  });

  it('按菜场价（基础价 × 菜场价阶梯，不含天气）：3 级食材按基础价 × 2 算', () => {
    const f = [...config.foods.values()].find((x) => x.level === 3 && !x.retired)!;
    expect(fridgeUnitPrice(f, tune)).toBe(Math.round(f.coin * tune.market.levelPriceRate[2]!));
    expect(fridgeEntryFee(f, 3, tune)).toBe(Math.ceil(3 * fridgeUnitPrice(f, tune) * 0.05));
    expect(fridgeThawFee(f, 3, tune)).toBe(Math.ceil(3 * fridgeUnitPrice(f, tune) * 0.1));
    const q = fridgeDailyFee([{ foodsId: f.id, num: 4 }], config, tune);
    expect(q).toEqual({
      kinds: 1,
      value: 4 * fridgeUnitPrice(f, tune),
      mult: 1,
      daily: Math.ceil(4 * fridgeUnitPrice(f, tune) * 0.005),
    });
  });
});

describe('入库费', () => {
  it('溢出进冰箱就收；银币够全付，不记欠费；餐厅动态写一条', async () => {
    const ctx = await newRestaurant(t, {
      patch: { cupboard_num: 1, coin: 100_000 },
      foods: { [fid('大米')]: 1 },
    });
    await runOp(t.game.deps, ctx, { feature: 'cupboard', source: 'test' }, (op) =>
      addFoods(op, fid('青椒'), 4),
    );
    const fee = fridgeEntryFee(food('青椒'), 4, tune);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.coin).toBe(100_000 - fee);
    expect(r.fridge_debt).toBe(0);
    expect(await logsOf(ctx.restaurantId, 'fridge.entry')).toEqual([
      { items: [{ foodsId: fid('青椒'), num: 4 }], coin: fee, owed: 0 },
    ]);
  });

  it('银币不够：扣到 0，差额记欠费，开始欠的那天记下来', async () => {
    const ctx = await newRestaurant(t, { patch: { cupboard_num: 1, coin: 10 }, foods: { [fid('大米')]: 1 } });
    await runOp(t.game.deps, ctx, { feature: 'cupboard', source: 'test' }, (op) =>
      addFoods(op, fid('青椒'), 4),
    );
    const fee = fridgeEntryFee(food('青椒'), 4, tune);
    const r = await restRow(t, ctx.restaurantId);
    expect(r.coin).toBe(0);
    expect(r.fridge_debt).toBe(fee - 10);
    expect(r.fridge_debt_since).toBe(gameDay(t.clock.now));
  });
});

describe('主动放冰箱', () => {
  it('放一部分：当场付入库费；整格放完就腾出橱柜格子', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 100_000 }, foods: { [fid('青椒')]: 5 } });
    const before = await c().list(ctx);
    const r1 = await c().freeze(ctx, { foodsId: fid('青椒'), num: 3 });
    const fee3 = fridgeEntryFee(food('青椒'), 3, tune);
    expect(r1.data).toEqual({ foodsId: fid('青椒'), moved: 3, coin: fee3 });
    expect(await foodNum(t, ctx.restaurantId, fid('青椒'))).toEqual({ num: 2, fridge: 3 });
    await c().freeze(ctx, { foodsId: fid('青椒'), num: 2 });
    const after = await c().list(ctx);
    expect(after.slotsUsed).toBe(before.slotsUsed - 1);
    expect(after.fridgeFee.kinds).toBe(1);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(
      100_000 - fee3 - fridgeEntryFee(food('青椒'), 2, tune),
    );
    expect(await logsOf(ctx.restaurantId, 'fridge.freeze')).toHaveLength(2);
  });

  it('银币不够、欠着费、橱柜里不够都拒绝，什么都不动', async () => {
    const poor = await newRestaurant(t, { patch: { coin: 0 }, foods: { [fid('青椒')]: 5 } });
    await expect(c().freeze(poor, { foodsId: fid('青椒'), num: 5 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
    });
    await expect(c().freeze(poor, { foodsId: fid('青椒'), num: 6 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
    });
    const owing = await newRestaurant(t, {
      patch: { coin: 100_000, fridge_debt: 1, fridge_debt_since: gameDay(t.clock.now) },
      foods: { [fid('青椒')]: 5 },
    });
    await expect(c().freeze(owing, { foodsId: fid('青椒'), num: 1 })).rejects.toMatchObject({
      params: { reason: 'fridge_debt' },
    });
    expect(await foodNum(t, owing.restaurantId, fid('青椒'))).toEqual({ num: 5, fridge: 0 });
  });
});

describe('解冻先补欠费', () => {
  it('银币够补清欠费加解冻费：一起扣，欠费清零', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 100_000, fridge_debt: 500, fridge_debt_since: gameDay(t.clock.now) },
    });
    await putFridge(ctx.restaurantId, [[fid('大米'), 2]]);
    const fee = fridgeThawFee(food('大米'), 2, tune);
    const r = await c().thaw(ctx, fid('大米'));
    expect(r.data).toEqual({ foodsId: fid('大米'), moved: 2, coin: fee, debtPaid: 500 });
    const row = await restRow(t, ctx.restaurantId);
    expect(row.coin).toBe(100_000 - 500 - fee);
    expect(row.fridge_debt).toBe(0);
    expect(row.fridge_debt_since).toBeNull();
  });

  it('不够补清加解冻费：整笔拒绝', async () => {
    const ctx = await newRestaurant(t, {
      patch: { coin: 600, fridge_debt: 500, fridge_debt_since: gameDay(t.clock.now) },
    });
    await putFridge(ctx.restaurantId, [[fid('大米'), 2]]);
    await expect(c().thaw(ctx, fid('大米'))).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect((await restRow(t, ctx.restaurantId)).fridge_debt).toBe(500);
    expect(await foodNum(t, ctx.restaurantId, fid('大米'))).toEqual({ num: 0, fridge: 2 });
  });
});

describe('每日仓储费', () => {
  it('21 格：整个冰箱按 ×1.5 收，银币够就全付', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10_000_000 } });
    const fs = commons().slice(0, 21);
    await putFridge(
      ctx.restaurantId,
      fs.map((f) => [f.id, 2]),
    );
    const value = fs.reduce((a, f) => a + 2 * fridgeUnitPrice(f, tune), 0);
    const fee = Math.ceil(value * 0.005 * 1.5);
    expect(await settle(ctx)).toEqual({ fee, paid: fee, debt: 0, seized: 0 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(10_000_000 - fee);
    expect(await logsOf(ctx.restaurantId, 'fridge.fee')).toEqual([
      { fee, kinds: 21, mult: 1.5, paid: fee, debt: 0 },
    ]);
  });

  it('先补旧欠费再收今天的；不够的记欠费，开始欠的那天不变；没满天数不抵债', async () => {
    const day = gameDay(t.clock.now);
    const since = addDays(day, -2);
    const ctx = await newRestaurant(t, { patch: { coin: 300, fridge_debt: 1000, fridge_debt_since: since } });
    await putFridge(ctx.restaurantId, [[fid('大米'), 10]]);
    const fee = Math.ceil(10 * fridgeUnitPrice(food('大米'), tune) * 0.005);
    expect(await settle(ctx)).toEqual({ fee, paid: 300, debt: 1000 + fee - 300, seized: 0 });
    const r = await restRow(t, ctx.restaurantId);
    expect(r.coin).toBe(0);
    expect(r.fridge_debt_since).toBe(since);
    expect(await foodNum(t, ctx.restaurantId, fid('大米'))).toEqual({ num: 0, fridge: 10 });
  });

  it('连续欠满 3 天：先卖本街用不到的、便宜的在前，卖够就停，多出的钱退回；欠费清零', async () => {
    const day = gameDay(t.clock.now);
    const ctx = await newRestaurant(t, {
      patch: { coin: 0, fridge_debt: 1000, fridge_debt_since: addDays(day, -3) },
    });
    const { needMap } = await streetNeeds(t.db, config, ctx.restaurantId, 0, tune.rest.cookbookMaxGrade);
    const lv1 = [...config.foods.values()].filter((f) => f.level === 1 && !f.retired);
    const needed = lv1.find((f) => (needMap.get(f.id) ?? 0) > 0)!;
    const spare = lv1.find((f) => !needMap.has(f.id))!;
    await putFridge(ctx.restaurantId, [
      [needed.id, 50],
      [spare.id, 50],
    ]);
    const due = 1000 + (await settle(ctx)).fee;
    const unit = Math.max(1, Math.floor(fridgeUnitPrice(spare, tune) * tune.shop.sellRate));
    const take = Math.ceil(due / unit);
    expect(take).toBeLessThan(50);
    expect(await foodNum(t, ctx.restaurantId, spare.id)).toEqual({ num: 0, fridge: 50 - take });
    expect(await foodNum(t, ctx.restaurantId, needed.id)).toEqual({ num: 0, fridge: 50 });
    const r = await restRow(t, ctx.restaurantId);
    expect(r.fridge_debt).toBe(0);
    expect(r.fridge_debt_since).toBeNull();
    expect(r.coin).toBe(take * unit - due);
    expect(await logsOf(ctx.restaurantId, 'fridge.seize')).toEqual([
      { items: [{ foodsId: spare.id, num: take }], coin: take * unit, debt: 0 },
    ]);
  });

  it('每日任务：只结算冰箱有东西或欠着费的店', async () => {
    const a = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    await putFridge(a.restaurantId, [[fid('大米'), 5]]);
    const b = await newRestaurant(t, {
      shardId: a.shardId,
      patch: { coin: 1_000_000 },
      foods: { [fid('大米')]: 5 },
    });
    const errors: unknown[] = [];
    const stats = await fridgeRound(t.game.deps, a.shardId, t.clock.now, { error: (e) => errors.push(e) });
    expect(errors).toEqual([]);
    expect(stats).toMatchObject({ rests: 1, failed: 0 });
    expect((await restRow(t, b.restaurantId)).coin).toBe(1_000_000);
    expect((await restRow(t, a.restaurantId)).coin).toBeLessThan(1_000_000);
  });
});
