import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { mealOf } from './service';

/** 开饭领体力（用户 2026-10-19）：午餐 12~14 点 +20，晚餐 18~20 点 +30 */
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => {
  t.clock.set(new Date());
  return t.close();
});

const MEALS = [
  { key: 'lunch' as const, from: 12, to: 14, amount: 20 },
  { key: 'dinner' as const, from: 18, to: 20, amount: 30 },
];

describe('哪一顿', () => {
  it('时段里是这一顿；两顿之间是下一顿；晚饭以后是明天的午饭；没配时段为 null', () => {
    expect(mealOf(MEALS, 12, () => 0)).toMatchObject({ key: 'lunch', open: true, eaten: false });
    expect(mealOf(MEALS, 13, () => 1)).toMatchObject({ key: 'lunch', open: true, eaten: true });
    expect(mealOf(MEALS, 14, () => 0)).toMatchObject({ key: 'dinner', open: false, tomorrow: false });
    expect(mealOf(MEALS, 3, () => 0)).toMatchObject({ key: 'lunch', open: false, tomorrow: false });
    expect(mealOf(MEALS, 20, () => 0)).toMatchObject({ key: 'lunch', open: false, tomorrow: true });
    expect(mealOf([], 12, () => 0)).toBeNull();
  });

  it('配置：午餐 20、晚餐 30', () => {
    expect(t.game.deps.config.tuning.strength.meals).toEqual(MEALS);
  });
});

describe('领体力', () => {
  it('晚餐时段领 30（可以超过上限），一顿只能领一次；活跃接口写已吃；时段外领不了', async () => {
    const r = await newRestaurant(t, { patch: { strength: 95 } });
    t.clock.set(new Date('2026-10-20T10:30:00Z')); // 北京时间 18:30
    expect((await t.game.task.activation(r)).meal).toMatchObject({ key: 'dinner', open: true, eaten: false });
    const res = await t.game.task.meal(r);
    expect(res.data).toEqual({ key: 'dinner', amount: 30 });
    expect(res.events).toContainEqual(expect.objectContaining({ type: 'gain', kind: 'strength', num: 30 }));
    expect((await restRow(t, r.restaurantId)).strength).toBe(125);
    await expect(t.game.task.meal(r)).rejects.toThrow();
    expect((await t.game.task.activation(r)).meal).toMatchObject({ key: 'dinner', eaten: true });
    t.clock.set(new Date('2026-10-20T13:00:00Z')); // 北京时间 21:00
    await expect(t.game.task.meal(r)).rejects.toMatchObject({ params: { reason: 'meal_closed' } });
    t.clock.set(new Date('2026-10-21T04:10:00Z')); // 第二天北京时间 12:10：午饭能领
    expect((await t.game.task.meal(r)).data).toEqual({ key: 'lunch', amount: 20 });
  });
});
