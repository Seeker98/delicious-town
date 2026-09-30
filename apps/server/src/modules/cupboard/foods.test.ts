import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, foodNum, newRestaurant, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { addFoods, addFoodsMany, planAddFoods, subFoods } from './foods';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const run = <T>(ctx: Parameters<typeof runOp>[1], fn: Parameters<typeof runOp<T>>[3]) =>
  runOp(t.game.deps, ctx, { feature: 'cupboard', source: 'test' }, fn);

describe('planAddFoods（规格书 00 §0.10）', () => {
  const base = { have: 0, fridge: 0, slotsUsed: 0, slots: 10, max: 999 };
  it('有空格子：全部进橱柜', () => {
    expect(planAddFoods(base, 5)).toEqual({ toCupboard: 5, toFridge: 0, dropped: 0 });
  });
  it('已有该食材：加到上限，溢出进冰箱', () => {
    expect(planAddFoods({ ...base, have: 995, slotsUsed: 1 }, 10)).toEqual({
      toCupboard: 4,
      toFridge: 6,
      dropped: 0,
    });
  });
  it('没有该食材且格子满了：全部进冰箱', () => {
    expect(planAddFoods({ ...base, slotsUsed: 10 }, 7)).toEqual({ toCupboard: 0, toFridge: 7, dropped: 0 });
  });
  it('冰箱也满了：丢弃', () => {
    expect(planAddFoods({ ...base, slotsUsed: 10, fridge: 997 }, 7)).toEqual({
      toCupboard: 0,
      toFridge: 2,
      dropped: 5,
    });
  });
});

describe('addFoods / subFoods', () => {
  it('橱柜满了：新食材进冰箱并标记未读；冰箱满了写丢弃日志，不报错', async () => {
    const ctx = await newRestaurant(t, { patch: { cupboard_num: 1, foods_max_num: 10 }, foods: { 101: 3 } });
    await run(ctx, async (op) => {
      await addFoods(op, 102, 15);
    });
    expect(await foodNum(t, ctx.restaurantId, 102)).toEqual({ num: 0, fridge: 10 });
    const row = await t.db
      .selectFrom('cupboard_food')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .where('foods_id', '=', 102)
      .executeTakeFirstOrThrow();
    expect(row.fridge_unread).toBe(true);
    const logs = await t.db
      .selectFrom('rest_log')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(logs.map((l) => [l.type, l.params])).toEqual([['fridge.drop', { foodsId: 102, num: 5 }]]);
  });

  it('得失提示和流水', async () => {
    const ctx = await newRestaurant(t);
    const r = await run(ctx, async (op) => {
      await addFoods(op, 101, 4);
    });
    expect(r.events).toEqual([{ type: 'gain', kind: 'foods', id: 101, num: 4 }]);
    const l = await t.db.selectFrom('ledger').selectAll().where('rest_id', '=', ctx.restaurantId).execute();
    expect(l.map((x) => [x.kind, x.item_id, x.delta])).toEqual([['foods', 101, 4]]);
  });

  it('扣到 0 删除这一行；锁定的保留（记住锁定）', async () => {
    const ctx = await newRestaurant(t, { foods: { 101: 2, 102: 2 } });
    await t.db
      .updateTable('cupboard_food')
      .set({ locked: true })
      .where('rest_id', '=', ctx.restaurantId)
      .where('foods_id', '=', 102)
      .execute();
    await run(ctx, async (op) => {
      await subFoods(op, 101, 2);
      await subFoods(op, 102, 2);
    });
    const rows = await t.db
      .selectFrom('cupboard_food')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(rows.map((r) => [r.foods_id, r.num, r.locked])).toEqual([[102, 0, true]]);
  });

  it('不够时抛 NOT_ENOUGH（带食材 id）', async () => {
    const ctx = await newRestaurant(t, { foods: { 101: 1 } });
    await expect(
      run(ctx, async (op) => {
        await subFoods(op, 101, 3);
      }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'foods', id: 101, need: 3, have: 1 } });
  });
});

describe('addFoodsMany（一次加多种，问题记录：多张探险图卡顿）', () => {
  /** 同样初始状态的店：橱柜 3 格、单种上限 10；101 有 8、102 有 2；120 只在冰箱里有 9 */
  const setup = async () => {
    const ctx = await newRestaurant(t, {
      patch: { cupboard_num: 3, foods_max_num: 10 },
      foods: { 101: 8, 102: 2, 120: 0 },
    });
    await t.db
      .updateTable('cupboard_food')
      .set({ fridge_num: 9 })
      .where('rest_id', '=', ctx.restaurantId)
      .where('foods_id', '=', 120)
      .execute();
    return ctx;
  };
  const snapshot = async (restId: number) => ({
    rows: await t.db
      .selectFrom('cupboard_food')
      .select(['foods_id', 'num', 'fridge_num', 'fridge_unread'])
      .where('rest_id', '=', restId)
      .orderBy('foods_id')
      .execute(),
    ledger: (
      await t.db
        .selectFrom('ledger')
        .select(['kind', 'item_id', 'delta', 'source'])
        .where('rest_id', '=', restId)
        .orderBy('id')
        .execute()
    ).map((x) => [x.kind, x.item_id, x.delta, x.source]),
    logs: (
      await t.db
        .selectFrom('rest_log')
        .select(['type', 'params'])
        .where('rest_id', '=', restId)
        .orderBy('id')
        .execute()
    ).map((x) => [x.type, x.params]),
  });

  it('结果和逐种 addFoods 完全一样：加满进冰箱、占新格子、格子满进冰箱、冰箱满丢弃', async () => {
    const add = new Map([
      [101, 5],
      [103, 4],
      [104, 12],
      [120, 3],
    ]);
    const a = await setup();
    const ra = await run(a, async (op) => {
      for (const [id, n] of add) await addFoods(op, id, n, { lucky: true });
    });
    const b = await setup();
    const rb = await run(b, (op) => addFoodsMany(op, add, { lucky: true }));
    expect(rb.events).toEqual(ra.events);
    expect(await snapshot(b.restaurantId)).toEqual(await snapshot(a.restaurantId));
    expect((await snapshot(b.restaurantId)).rows).toEqual([
      { foods_id: 101, num: 10, fridge_num: 3, fridge_unread: true },
      { foods_id: 102, num: 2, fridge_num: 0, fridge_unread: false },
      { foods_id: 103, num: 4, fridge_num: 0, fridge_unread: false },
      { foods_id: 104, num: 0, fridge_num: 10, fridge_unread: true },
      { foods_id: 120, num: 0, fridge_num: 10, fridge_unread: true },
    ]);
  });

  it('空的不做事；数量 ≤ 0 的跳过', async () => {
    const ctx = await newRestaurant(t);
    const r = await run(ctx, async (op) => {
      await addFoodsMany(op, new Map());
      await addFoodsMany(op, new Map([[101, 0]]));
    });
    expect(r.events).toEqual([]);
    expect(await foodNum(t, ctx.restaurantId, 101)).toEqual({ num: 0, fridge: 0 });
  });
});
