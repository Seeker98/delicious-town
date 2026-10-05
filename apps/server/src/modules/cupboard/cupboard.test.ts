import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FOODS } from '@dt/config';
import { gameDay, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { fid } from '../../../test/items';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
/** 随机数固定 0：合成必成功，按池子顺序抽第一个 */
let win: TestGame;
beforeAll(async () => {
  win = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
});
const c = () => t.game.cupboard;

describe('橱柜列表', () => {
  it('格数、锁定格、本街需求', async () => {
    const ctx = await newRestaurant(t, { foods: { [fid('葡萄')]: 3, [fid('大米')]: 1 } });
    const l = await c().list(ctx);
    expect(l).toMatchObject({
      slotsUsed: 2,
      slots: 100,
      lockUsed: 0,
      lockSlots: 15,
      targetGrade: 5,
      handleMax: 100,
    });
    expect(l.items.find((x) => x.foodsId === fid('葡萄'))!.streetNeed).toBeGreaterThan(0);
  });
});

describe('锁定（规格书 05 §5.3）', () => {
  it('锁定占格；锁定格满了报错；解锁已用完的食材时删除记录', async () => {
    const ctx = await newRestaurant(t, {
      patch: { foods_lock_num: 1 },
      foods: { [fid('大米')]: 1, [fid('青椒')]: 1 },
    });
    await c().lock(ctx, 101);
    await expect(c().lock(ctx, 102)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    await t.db
      .updateTable('cupboard_food')
      .set({ num: 0 })
      .where('rest_id', '=', ctx.restaurantId)
      .where('foods_id', '=', 101)
      .execute();
    await c().unlock(ctx, 101);
    const rows = await t.db
      .selectFrom('cupboard_food')
      .select('foods_id')
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(rows.map((r) => r.foods_id)).toEqual([102]);
  });
});

describe('冰箱（规格书 05 §5.2）', () => {
  it('列表里的解冻数受橱柜单种上限限制，费用按能解冻的个数算（问题记录 206）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10000, foods_max_num: 10 } });
    await t.db
      .insertInto('cupboard_food')
      .values({ rest_id: ctx.restaurantId, foods_id: fid('大米'), num: 7, fridge_num: 5 })
      .execute();
    const f = await c().fridge(ctx);
    expect(f.items[0]).toMatchObject({
      num: 5,
      thawable: 3,
      thawCoin: Math.ceil(3 * config.requireFood(fid('大米')).coin * 0.25),
    });
  });

  it('解冻：移回橱柜，花 数量×单价×0.25 银币', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 10000 } });
    await t.db
      .insertInto('cupboard_food')
      .values({
        rest_id: ctx.restaurantId,
        foods_id: fid('大米'),
        num: 0,
        fridge_num: 2,
        fridge_unread: true,
      })
      .execute();
    const cost = Math.ceil(2 * config.requireFood(fid('大米')).coin * 0.25);
    // 列表先告诉玩家能解冻几个、要花多少银币（问题记录 206）
    const f = await c().fridge(ctx);
    expect(f.items).toEqual([{ foodsId: fid('大米'), num: 2, thawable: 2, thawCoin: cost }]);
    await c().readFridge(ctx);
    const r = await c().thaw(ctx, 101);
    expect(r.data).toEqual({ foodsId: fid('大米'), moved: 2, coin: cost });
    expect(await foodNum(t, ctx.restaurantId, fid('大米'))).toEqual({ num: 2, fridge: 0 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(10000 - cost);
  });
  it('橱柜满且没有这种食材时不能解冻', async () => {
    const ctx = await newRestaurant(t, {
      patch: { cupboard_num: 1, coin: 10000 },
      foods: { [fid('青椒')]: 1 },
    });
    await t.db
      .insertInto('cupboard_food')
      .values({ rest_id: ctx.restaurantId, foods_id: fid('大米'), num: 0, fridge_num: 2 })
      .execute();
    await expect(c().thaw(ctx, 101)).rejects.toMatchObject({ code: 'CUPBOARD_FULL' });
  });
});

describe('合成分解', () => {
  it('分解 3 个 2 级食材：6 次机会，扣原料，记当天次数', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1000 }, foods: { [fid('葡萄')]: 3 } });
    const r = await c().handle(ctx, { foodsId: fid('葡萄'), way: 'decompose', num: 3 });
    expect(r.data.chances).toBe(6);
    expect(r.data.strengthUsed).toBe(0);
    expect((await foodNum(t, ctx.restaurantId, fid('葡萄'))).num).toBe(0);
    const gained = r.data.gained.reduce((s, g) => s + g.num, 0);
    expect(gained).toBe(r.data.success);
  });

  it('超过当天免体力次数后每次 1 体力（按北京时间的日期）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 1000, strength: 10 }, foods: { [fid('葡萄')]: 2 } });
    await t.db
      .insertInto('daily_counter')
      .values({ rest_id: ctx.restaurantId, day: gameDay(t.clock.now), key: 'foods.handle', count: 20 })
      .execute();
    const r = await c().handle(ctx, { foodsId: fid('葡萄'), way: 'decompose', num: 1 });
    expect(r.data.strengthUsed).toBe(1);
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(9);
  });

  it('不能处理的等级、合成数量是奇数、没有银币时报错', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, foods: { [fid('大米')]: 4, [fid('葡萄')]: 4 } });
    await expect(c().handle(ctx, { foodsId: fid('大米'), way: 'decompose', num: 1 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(c().handle(ctx, { foodsId: fid('大米'), way: 'compose', num: 3 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(c().handle(ctx, { foodsId: fid('葡萄'), way: 'decompose', num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
    });
  });
});

describe('万能食材兑换（规格书 05 §5.5）', () => {
  it('2 个一级万能食材 → 1 个 2 级稀有食材', async () => {
    const ctx = await newRestaurant(t, { foods: { [fid('一级万能食材')]: 4 } });
    const r = await c().exchange(ctx, { foodsId: FOODS.masterLevel1, times: 2 });
    expect((await foodNum(t, ctx.restaurantId, fid('一级万能食材'))).num).toBe(0);
    const gains = r.events.filter((e) => e.type === 'gain' && e.kind === 'foods');
    expect(gains.reduce((s, e) => s + e.num, 0)).toBe(2);
    for (const e of gains) {
      const f = config.requireFood(e.id!);
      expect(f.level).toBe(2);
      expect(f.odds).toBeLessThan(100);
    }
  });
});

describe('合成不抽已经堆满的食材（问题记录 290）', () => {
  it('同等级其他食材都堆满时，合成只出没满的那一种', async () => {
    const level2 = config.foodPools.get(2)!.items.map((f) => f.id);
    const want = level2.at(-1)!;
    const foods: Record<number, number> = { 101: 4 };
    for (const id of level2) if (id !== want) foods[id] = 5;
    const ctx = await newRestaurant(win, { patch: { coin: 1000, foods_max_num: 5 }, foods });
    const r = await win.game.cupboard.handle(ctx, { foodsId: fid('大米'), way: 'compose', num: 4 });
    expect(r.data.success).toBeGreaterThan(0);
    expect(r.data.gained).toEqual([{ foodsId: want, num: r.data.success }]);
  });
});
