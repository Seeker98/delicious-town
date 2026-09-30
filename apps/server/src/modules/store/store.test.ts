import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from './grant';

const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
const s = () => t.game.store;
const tablesOf = async (restId: number) =>
  (
    await t.db
      .selectFrom('restaurant_tables')
      .select('tables')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow()
  ).tables;

describe('使用道具（规格书 07 §7.4）', () => {
  it('金币可以批量使用', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, goods: { 85: 2 } });
    await s().use(ctx, { goodsId: 85, num: 2 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(200000);
    expect(await goodsNum(t, ctx.restaurantId, 85)).toBe(0);
  });

  it('餐桌A、扩建卡可以批量；洗点卡不能批量（问题记录：餐桌A、大扩建卡只能用一个）', async () => {
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: { table_num: 10, store_num: 20, attr_cook: 3 },
      tables,
      goods: { 82: 5, 8: 3, 55: 2 },
    });
    await s().use(ctx, { goodsId: 82, num: 3 });
    expect(await tablesOf(ctx.restaurantId)).toHaveLength(7);
    await s().use(ctx, { goodsId: 8, num: 3 });
    expect((await restRow(t, ctx.restaurantId)).store_num).toBe(50);
    await expect(s().use(ctx, { goodsId: 55, num: 2 })).rejects.toMatchObject({
      params: { reason: 'no_batch' },
    });
  });

  it('扩容卡：橱柜格数不超过食材种类总数；超过所需张数报上限，满了再用报橱柜已满，都不扣道具', async () => {
    const ctx = await newRestaurant(t, { patch: { cupboard_num: config.foods.size - 15 }, goods: { 5: 5 } });
    expect((await s().list(ctx, {})).items.find((x) => x.goodsId === 5)?.maxUse).toBe(2);
    await expect(s().use(ctx, { goodsId: 5, num: 3 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'batch', max: 2 },
    });
    await s().use(ctx, { goodsId: 5, num: 2 });
    expect((await restRow(t, ctx.restaurantId)).cupboard_num).toBe(config.foods.size);
    expect((await s().list(ctx, {})).items.find((x) => x.goodsId === 5)?.maxUse).toBe(0);
    await expect(s().use(ctx, { goodsId: 5, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'cupboard_slots' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 5)).toBe(3);
  });

  it('餐桌A：加一张桌，受餐桌上限限制；超出时报错且不扣道具', async () => {
    // 上限 5 张，现有 4 张
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, { patch: { table_num: 5 }, tables, goods: { 82: 2 } });
    await s().use(ctx, { goodsId: 82, num: 1 });
    expect((await tablesOf(ctx.restaurantId)).map((x) => x.no)).toEqual([1, 2, 3, 4, 5]);
    await expect(s().use(ctx, { goodsId: 82, num: 1 })).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
    expect(await goodsNum(t, ctx.restaurantId, 82)).toBe(1);
  });

  it('体力卡可以超过上限；神秘食材随机劵得到一个 7 级食材', async () => {
    const ctx = await newRestaurant(t, {
      patch: { strength: 100, strength_max: 100 },
      goods: { 29: 1, 139: 1 },
    });
    await s().use(ctx, { goodsId: 29, num: 1 });
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(200);
    const r = await s().use(ctx, { goodsId: 139, num: 1 });
    const food = r.events.find((e) => e.kind === 'foods' && e.type === 'gain')!;
    expect(config.requireFood(food.id!).level).toBe(7);
  });

  it('洗点卡：返还已加的点；没加过点时报错', async () => {
    const ctx = await newRestaurant(t, {
      patch: { attr_left: 1, attr_cook: 2, attr_fire: 1 },
      goods: { 55: 2 },
    });
    await s().use(ctx, { goodsId: 55, num: 1 });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ attr_left: 4, attr_cook: 0, attr_fire: 0 });
    await expect(s().use(ctx, { goodsId: 55, num: 1 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await goodsNum(t, ctx.restaurantId, 55)).toBe(1);
  });

  it('鞋带：36 个普通飞弹捆成 1 个极速飞弹', async () => {
    const ctx = await newRestaurant(t, { goods: { 169: 1, 18: 40 } });
    await s().use(ctx, { goodsId: 169, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, 18)).toBe(4);
    expect(await goodsNum(t, ctx.restaurantId, 17)).toBe(1);
  });

  it('打开签到礼包', async () => {
    const ctx = await newRestaurant(t, { goods: { 115: 1 } });
    await s().use(ctx, { goodsId: 115, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBeGreaterThanOrEqual(20);
  });

  it('不能用的道具报 NOT_USABLE', async () => {
    const ctx = await newRestaurant(t, { goods: { 86: 1 } });
    await expect(s().use(ctx, { goodsId: 86, num: 1 })).rejects.toMatchObject({ code: 'NOT_USABLE' });
  });
});

describe('批量开礼包（问题记录：99 个随机万能食材礼包要 1.5 秒）', () => {
  it('同样的奖励合并发放：得到的总数不变，事件和流水按食材合并', async () => {
    const ctx = await newRestaurant(t, { goods: { 131: 99 } });
    const r = await s().use(ctx, { goodsId: 131, num: 99 });
    const foods = await t.db
      .selectFrom('cupboard_food')
      .select(['num', 'fridge_num'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    // 每个礼包：万能食材 1 个 + 1 级食材 2 个
    expect(foods.reduce((n, f) => n + f.num + f.fridge_num, 0)).toBe(99 * 3);
    // 合并前每开一个礼包就有 2 条（共 199 条）；合并后不超过食材种数
    expect(r.events.length).toBeLessThanOrEqual(40);
  });
});

describe('仓库列表与流水', () => {
  it('列表：可用、可批量、出售价；过期勋章不显示', async () => {
    const ctx = await newRestaurant(t, { goods: { 85: 1, 13: 1 } });
    await grantGoods(t.db, config, ctx.restaurantId, 133, 1, new Date(Date.now() - 5 * 3600_000));
    const l = await s().list(ctx, {});
    expect(l.items.find((x) => x.goodsId === 85)).toMatchObject({ usable: true, batch: true });
    expect(l.items.find((x) => x.goodsId === 13)).toMatchObject({ usable: false, sellPrice: 700 });
    expect(l.items.some((x) => x.goodsId === 133)).toBe(false);
    expect(l.kinds).toBe(2);
  });

  it('列表给出每个道具一次最多能用几个（问题记录：批量使用不提示上限）', async () => {
    // 上限 6 张，现有 4 张：餐桌A 最多用 2 个；鞋带受普通飞弹数量限制（80 / 36 = 2）
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: { table_num: 6 },
      tables,
      goods: { 85: 150, 29: 3, 82: 5, 13: 1, 55: 2, 169: 5, 18: 80 },
    });
    const l = await s().list(ctx, {});
    const item = (id: number) => l.items.find((x) => x.goodsId === id);
    expect(item(85)?.maxUse).toBe(99);
    expect(item(29)?.maxUse).toBe(3);
    expect(item(82)).toMatchObject({ batch: true, maxUse: 2 });
    expect(item(169)).toMatchObject({ batch: true, maxUse: 2 });
    expect(item(55)).toMatchObject({ batch: false, maxUse: 1 });
    expect(item(13)?.maxUse).toBe(0);
  });

  it('批量超过单次上限时报 LIMIT_REACHED 并带上限，不扣道具', async () => {
    const ctx = await newRestaurant(t, { goods: { 85: 150 } });
    await expect(s().use(ctx, { goodsId: 85, num: 120 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'batch', max: 99 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 85)).toBe(150);
  });

  it('道具流水：最近 1 小时', async () => {
    const ctx = await newRestaurant(t, { goods: { 85: 1 } });
    await s().use(ctx, { goodsId: 85, num: 1 });
    const r = await s().records(ctx, { range: '1h' });
    expect(r.map((x) => [x.kind, x.delta])).toEqual(
      expect.arrayContaining([
        ['goods', -1],
        ['coin', 100000],
      ]),
    );
  });
});
