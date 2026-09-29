import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, foodNum, newRestaurant, type TestGame } from '../../../test/game';
import { runOp } from '../../core/op';
import { addFoods, planAddFoods, subFoods } from './foods';

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
