import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { grantGoods } from './grant';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

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
    const ctx = await newRestaurant(t, { patch: { coin: 0 }, goods: { [gid('金币')]: 2 } });
    await s().use(ctx, { goodsId: gid('金币'), num: 2 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(200000);
    expect(await goodsNum(t, ctx.restaurantId, gid('金币'))).toBe(0);
  });

  it('餐桌A、扩建卡可以批量；洗点卡不能批量（问题记录：餐桌A、大扩建卡只能用一个）', async () => {
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: { table_num: 10, store_num: 20, attr_cook: 3 },
      tables,
      goods: { [GOODS.tableA]: 5, [gid('大扩建卡')]: 3, [GOODS.resetAttrCard]: 2 },
    });
    await s().use(ctx, { goodsId: GOODS.tableA, num: 3 });
    expect(await tablesOf(ctx.restaurantId)).toHaveLength(7);
    await s().use(ctx, { goodsId: gid('大扩建卡'), num: 3 });
    expect((await restRow(t, ctx.restaurantId)).store_num).toBe(50);
    await expect(s().use(ctx, { goodsId: GOODS.resetAttrCard, num: 2 })).rejects.toMatchObject({
      params: { reason: 'no_batch' },
    });
  });

  it('扩容卡：橱柜格数不超过食材种类总数；超过所需张数报上限，满了再用报橱柜已满，都不扣道具', async () => {
    const ctx = await newRestaurant(t, {
      patch: { cupboard_num: config.foods.size - 15 },
      goods: { [gid('大扩容卡')]: 5 },
    });
    expect((await s().list(ctx, {})).items.find((x) => x.goodsId === gid('大扩容卡'))?.maxUse).toBe(2);
    await expect(s().use(ctx, { goodsId: gid('大扩容卡'), num: 3 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'batch', max: 2 },
    });
    await s().use(ctx, { goodsId: gid('大扩容卡'), num: 2 });
    expect((await restRow(t, ctx.restaurantId)).cupboard_num).toBe(config.foods.size);
    expect((await s().list(ctx, {})).items.find((x) => x.goodsId === gid('大扩容卡'))?.maxUse).toBe(0);
    await expect(s().use(ctx, { goodsId: gid('大扩容卡'), num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'cupboard_slots' },
    });
    expect(await goodsNum(t, ctx.restaurantId, gid('大扩容卡'))).toBe(3);
  });

  it('餐桌A：加一张桌，受餐桌上限限制；超出时报错且不扣道具', async () => {
    // 上限 5 张，现有 4 张
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, { patch: { table_num: 5 }, tables, goods: { [GOODS.tableA]: 2 } });
    await s().use(ctx, { goodsId: GOODS.tableA, num: 1 });
    expect((await tablesOf(ctx.restaurantId)).map((x) => x.no)).toEqual([1, 2, 3, 4, 5]);
    await expect(s().use(ctx, { goodsId: GOODS.tableA, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
    });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.tableA)).toBe(1);
  });

  it('体力卡可以超过上限；神秘食材随机劵得到一个 7 级食材', async () => {
    const ctx = await newRestaurant(t, {
      patch: { strength: 100, strength_max: 100 },
      goods: { [gid('体力卡')]: 1, [gid('神秘食材随机劵')]: 1 },
    });
    await s().use(ctx, { goodsId: gid('体力卡'), num: 1 });
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(200);
    const r = await s().use(ctx, { goodsId: gid('神秘食材随机劵'), num: 1 });
    const food = r.events.find((e) => e.kind === 'foods' && e.type === 'gain')!;
    expect(config.requireFood(food.id!).level).toBe(7);
  });

  it('N 级食材随机券：用 3 张得到 3 个这一等级的食材（问题记录 331）', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('二级食材随机券')]: 3 } });
    const r = await s().use(ctx, { goodsId: gid('二级食材随机券'), num: 3 });
    const foods = r.events.filter((e) => e.kind === 'foods' && e.type === 'gain');
    expect(foods.reduce((n, e) => n + (e.num ?? 0), 0)).toBe(3);
    for (const e of foods) expect(config.requireFood(e.id!).level).toBe(2);
    expect(await goodsNum(t, ctx.restaurantId, gid('二级食材随机券'))).toBe(0);
  });

  it('一次用 50 张食材随机券：同一种食材合成一条记录，不是每张一条', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('一级食材随机券')]: 50 } });
    const r = await s().use(ctx, { goodsId: gid('一级食材随机券'), num: 50 });
    const foods = r.events.filter((e) => e.kind === 'foods' && e.type === 'gain');
    expect(foods.reduce((n, e) => n + (e.num ?? 0), 0)).toBe(50);
    // 一级食材 27 种，抽 50 次必有重复
    expect(new Set(foods.map((e) => e.id)).size).toBe(foods.length);
    expect(foods.length).toBeLessThan(50);
  });

  it('新手大礼包打开后：银币 5 万、钻石 50、喇叭 3、一二三级食材随机券 50、20、10 张等（问题记录 331）', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0, diamond: 0 }, goods: { [gid('新手大礼包')]: 1 } });
    await s().use(ctx, { goodsId: gid('新手大礼包'), num: 1 });
    const row = await restRow(t, ctx.restaurantId);
    expect([row.coin, row.diamond]).toEqual([50000, 50]);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.horn)).toBe(3);
    expect(await goodsNum(t, ctx.restaurantId, gid('一级食材随机券'))).toBe(50);
    expect(await goodsNum(t, ctx.restaurantId, gid('二级食材随机券'))).toBe(20);
    expect(await goodsNum(t, ctx.restaurantId, gid('三级食材随机券'))).toBe(10);
    expect(await goodsNum(t, ctx.restaurantId, gid('新手大礼包'))).toBe(0);
  });

  it('洗点卡：返还已加的点；没加过点时报错', async () => {
    const ctx = await newRestaurant(t, {
      patch: { attr_left: 1, attr_cook: 2, attr_fire: 1 },
      goods: { [GOODS.resetAttrCard]: 2 },
    });
    await s().use(ctx, { goodsId: GOODS.resetAttrCard, num: 1 });
    expect(await restRow(t, ctx.restaurantId)).toMatchObject({ attr_left: 4, attr_cook: 0, attr_fire: 0 });
    await expect(s().use(ctx, { goodsId: GOODS.resetAttrCard, num: 1 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.resetAttrCard)).toBe(1);
  });

  it('鞋带：36 个普通飞弹捆成 1 个极速飞弹', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('鞋带')]: 1, [GOODS.missileNormal]: 40 } });
    await s().use(ctx, { goodsId: gid('鞋带'), num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.missileNormal)).toBe(4);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.missileSpeed)).toBe(1);
  });

  it('打开签到礼包', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.signInGift]: 1 } });
    await s().use(ctx, { goodsId: GOODS.signInGift, num: 1 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mysteryTicket)).toBeGreaterThanOrEqual(20);
  });

  it('不能用的道具报 NOT_USABLE', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.starCert]: 1 } });
    await expect(s().use(ctx, { goodsId: GOODS.starCert, num: 1 })).rejects.toMatchObject({
      code: 'NOT_USABLE',
    });
  });
});

describe('批量开礼包（问题记录：99 个随机万能食材礼包要 1.5 秒）', () => {
  it('同样的奖励合并发放：得到的总数不变，事件和流水按食材合并', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('随机万能食材礼包')]: 99 } });
    const r = await s().use(ctx, { goodsId: gid('随机万能食材礼包'), num: 99 });
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
    const ctx = await newRestaurant(t, { goods: { [gid('金币')]: 1, [gid('普通宣传海报')]: 1 } });
    await grantGoods(t.db, config, ctx.restaurantId, GOODS.krabHappy, 1, new Date(Date.now() - 5 * 3600_000));
    const l = await s().list(ctx, {});
    expect(l.items.find((x) => x.goodsId === gid('金币'))).toMatchObject({ usable: true, batch: true });
    expect(l.items.find((x) => x.goodsId === gid('普通宣传海报'))).toMatchObject({
      usable: false,
      sellPrice: 700,
    });
    expect(l.items.some((x) => x.goodsId === GOODS.krabHappy)).toBe(false);
    expect(l.kinds).toBe(2);
  });

  it('列表给出每个道具一次最多能用几个（问题记录：批量使用不提示上限）', async () => {
    // 上限 6 张，现有 4 张：餐桌A 最多用 2 个；鞋带受普通飞弹数量限制（80 / 36 = 2）
    const tables = [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 }));
    const ctx = await newRestaurant(t, {
      patch: { table_num: 6 },
      tables,
      goods: {
        [gid('金币')]: 150,
        [gid('体力卡')]: 3,
        [GOODS.tableA]: 5,
        [gid('普通宣传海报')]: 1,
        [GOODS.resetAttrCard]: 2,
        [gid('鞋带')]: 5,
        [GOODS.missileNormal]: 80,
      },
    });
    const l = await s().list(ctx, {});
    const item = (id: number) => l.items.find((x) => x.goodsId === id);
    expect(item(gid('金币'))?.maxUse).toBe(99);
    expect(item(gid('体力卡'))?.maxUse).toBe(3);
    expect(item(GOODS.tableA)).toMatchObject({ batch: true, maxUse: 2 });
    expect(item(gid('鞋带'))).toMatchObject({ batch: true, maxUse: 2 });
    expect(item(GOODS.resetAttrCard)).toMatchObject({ batch: false, maxUse: 1 });
    expect(item(gid('普通宣传海报'))?.maxUse).toBe(0);
  });

  it('批量超过单次上限时报 LIMIT_REACHED 并带上限，不扣道具', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('金币')]: 150 } });
    await expect(s().use(ctx, { goodsId: gid('金币'), num: 120 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'batch', max: 99 },
    });
    expect(await goodsNum(t, ctx.restaurantId, gid('金币'))).toBe(150);
  });

  it('道具流水：最近 1 小时', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('金币')]: 1 } });
    await s().use(ctx, { goodsId: gid('金币'), num: 1 });
    const r = await s().records(ctx, { range: '1h' });
    expect(r.map((x) => [x.kind, x.delta])).toEqual(
      expect.arrayContaining([
        ['goods', -1],
        ['coin', 100000],
      ]),
    );
  });
});
