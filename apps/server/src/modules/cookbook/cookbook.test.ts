import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const cb = () => t.game.cookbook;
const levelOf = async (restId: number, id: number) =>
  (
    await t.db
      .selectFrom('restaurant_cookbooks')
      .select('levels')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow()
  ).levels[id];

describe('学习食谱', () => {
  it('食材够：学会 1 品级，扣食材，更新派生计数', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1, 253: 1, 366: 2 } });
    const r = await cb().learn(ctx, 194);
    expect(r.data).toEqual({ cookbookId: 194, grade: 1, learnType: '0' });
    expect(await levelOf(ctx.restaurantId, 194)).toBe(1);
    expect((await foodNum(t, ctx.restaurantId, 366)).num).toBe(1);
    expect((await foodNum(t, ctx.restaurantId, 302)).num).toBe(0);
    const counts = (await restRow(t, ctx.restaurantId)).cookbook_counts;
    expect(counts).toMatchObject({ learned: 1, street: { '0': 1 } });
    expect(counts.grade[1]).toBe(1);
  });

  it('缺一种时用同级万能食材（桑椹 3 级 → 469）', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1, 253: 1, 469: 1 } });
    const r = await cb().learn(ctx, 194);
    expect(r.data.learnType).toBe('3');
    expect((await foodNum(t, ctx.restaurantId, 469)).num).toBe(0);
  });

  it('不够时报 NOT_ENOUGH（带第一种缺的食材）', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1 } });
    await expect(cb().learn(ctx, 194)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'foods' },
    });
  });

  it('已经是最高品级（7）时报错', async () => {
    const ctx = await newRestaurant(t, { cookbooks: { 194: 7 } });
    await expect(cb().learn(ctx, 194)).rejects.toMatchObject({ code: 'COOKBOOK_MAX_GRADE' });
  });
});

describe('食谱列表、详情、需求', () => {
  it('列表：可以学的排在前面，带下一级所需食材和持有数', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1, 253: 1, 366: 1 } });
    const list = await cb().list(ctx, { street: 0, page: 1, filter: 'all' });
    expect(list.streetTotal).toBe(72);
    expect(list.items[0]).toMatchObject({ id: 194, grade: 0, learn: '0' });
    expect(list.items[0]!.next).toEqual(expect.arrayContaining([{ foodsId: 366, num: 1, have: 1 }]));
    const learnable = await cb().list(ctx, { street: 0, page: 1, filter: 'learnable' });
    expect(learnable.items.every((x) => x.learn !== 'z' && x.learn !== 'max')).toBe(true);
  });

  it('详情：各品级所需食材', async () => {
    const ctx = await newRestaurant(t);
    const d = await cb().detail(ctx, 194);
    expect(d).toMatchObject({ id: 194, streetId: 0, streetName: '新手街', grade: 0, learn: 'z' });
    expect(d.grades.map((g) => g.grade)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('需求计算：新手街全部学会 1 品级还差多少', async () => {
    const ctx = await newRestaurant(t, { foods: { 302: 1 } });
    const n = await cb().foodsNeed(ctx, { street: 0, target: 1 });
    const grape = n.items.find((x) => x.foodsId === 302)!;
    expect(grape.have).toBe(1);
    expect(grape.lack).toBe(grape.need - 1);
  });
});
