import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { listNews } from '../news/news';
import { GOODS } from '@dt/config';
import { fid, gid } from '../../../test/items';

const DAY = '2026-09-30';
const config = testConfig();
const lv1 = config.foodsByLevel.get(1)!;
const common = lv1.filter((f) => f.odds === 100);
const rare1 = lv1.find((f) => f.odds < 100)!;
const lv2 = config.foodsByLevel.get(2)![0]!;
const mystery = config.foodsByLevel.get(7)!.find((f) => f.id !== 573 && f.id !== 574)!;

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

describe('13 哥食材兑换券页的排序数据（问题记录 491）', () => {
  it('每种可换食材我有几个、本街的菜还要几个（和橱柜同一口径）；没有的、不要的不写', async () => {
    const grape = fid('葡萄');
    const a = await newRestaurant(t, { foods: { [grape]: 3 } });
    const v = await t.game.town.exchangeView(a);
    const level = config.foods.get(grape)!.level;
    expect(v.levelFoods[level - 1]).toContain(grape);
    expect(v.foodHave).toEqual({ [grape]: 3 });
    const cup = await t.game.cupboard.list(a);
    const need = cup.items.find((x) => x.foodsId === grape)!.streetNeed;
    expect(need).toBeGreaterThan(0);
    expect(v.streetNeed[grape]).toBe(need);
    const listed = new Set(v.levelFoods.flat());
    expect(Object.keys(v.streetNeed).every((id) => listed.has(Number(id)))).toBe(true);
    expect(Object.values(v.streetNeed).every((n) => n > 0)).toBe(true);
  });
});

describe('镇长兑换（设计文档 §3.6）', () => {
  it('兑换页：37 项 (2026-10-08 下架一批后)、持有数、已兑次数、两种券和可换食材', async () => {
    const a = await newRestaurant(t, {
      goods: { [gid('蟹黄堡')]: 10, [gid('一级食材兑换券')]: 2, [GOODS.mysteryFoodExchange]: 1 },
    });
    const v = await t.game.town.exchangeView(a);
    expect(v.items).toHaveLength(37);
    expect(v.items.find((x) => x.id === 10)).toEqual({
      id: 10,
      category: 'bg',
      goodsId: gid('雷神锤'),
      num: 1,
      need: [{ goodsId: gid('蟹黄堡'), num: 8, have: 10 }],
      times: 1,
      used: 0,
    });
    expect(v.levelTickets).toEqual([2, 0, 0, 0, 0]);
    expect(v.mysteryTickets).toBe(1);
    expect([...v.levelFoods[0]!].sort()).toEqual(common.map((f) => f.id).sort());
    expect(v.mysteryFoods).toContain(mystery.id);
    expect(v.maxNum).toBe(99);
  });

  it('限兑 1 次的项：扣材料、给道具、写新闻；第二次被拒', async () => {
    const a = await newRestaurant(t, { goods: { [gid('蟹黄堡')]: 20 } });
    expect((await t.game.town.exchange(a, { id: 10, num: 1 })).data).toEqual({
      goodsId: gid('雷神锤'),
      num: 1,
    });
    expect(await goodsNum(t, a.restaurantId, gid('蟹黄堡'))).toBe(12);
    expect(await goodsNum(t, a.restaurantId, gid('雷神锤'))).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['town.exchange'] });
    expect(n).toMatchObject({
      restId: a.restaurantId,
      params: { exchangeId: 10, goodsId: gid('雷神锤'), num: 1 },
    });
    await expect(t.game.town.exchange(a, { id: 10, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'town_exchange', max: 1, used: 1 },
    });
    expect((await t.game.town.exchangeView(a)).items.find((x) => x.id === 10)!.used).toBe(1);
  });

  it('一次兑多份：限次项超出上限整单拒绝；材料按份数不够时什么都不扣', async () => {
    const a = await newRestaurant(t, { goods: { [gid('蟹黄堡')]: 5 } });
    await expect(t.game.town.exchange(a, { id: 10, num: 2 })).rejects.toMatchObject({
      params: { what: 'town_exchange', max: 1, used: 0 },
    });
    await expect(t.game.town.exchange(a, { id: 1, num: 3 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: gid('蟹黄堡'), need: 6, have: 5 },
    });
    expect(await goodsNum(t, a.restaurantId, gid('蟹黄堡'))).toBe(5);
    expect(await goodsNum(t, a.restaurantId, gid('神秘食材随机劵'))).toBe(0);
    expect((await t.game.town.exchange(a, { id: 1, num: 2 })).data).toEqual({
      goodsId: gid('神秘食材随机劵'),
      num: 2,
    });
    expect(await goodsNum(t, a.restaurantId, gid('蟹黄堡'))).toBe(1);
  });

  it('份数超过上限、兑换项不存在', async () => {
    const a = await newRestaurant(t, { goods: { [gid('蟹黄堡')]: 500 } });
    await expect(t.game.town.exchange(a, { id: 1, num: 100 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'batch', max: 99 },
    });
    await expect(t.game.town.exchange(a, { id: 999, num: 1 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'no_exchange' },
    });
  });
});

describe('食材兑换券（设计文档 §3.6）', () => {
  it('一级券：一次换多种普通食材，合计扣券', async () => {
    const a = await newRestaurant(t, { goods: { [gid('一级食材兑换券')]: 3 } });
    const [x, y] = common;
    const r = (
      await t.game.town.levelTicket(a, {
        level: 1,
        picks: [
          { foodsId: x!.id, num: 2 },
          { foodsId: y!.id, num: 1 },
        ],
      })
    ).data;
    expect(r.foods).toEqual([
      { foodsId: x!.id, num: 2 },
      { foodsId: y!.id, num: 1 },
    ]);
    expect(await goodsNum(t, a.restaurantId, gid('一级食材兑换券'))).toBe(0);
    expect((await foodNum(t, a.restaurantId, x!.id)).num).toBe(2);
  });

  it('等级不符、不是普通食材、券不够都拒绝，不扣券', async () => {
    const a = await newRestaurant(t, { goods: { [gid('一级食材兑换券')]: 1 } });
    await expect(
      t.game.town.levelTicket(a, { level: 1, picks: [{ foodsId: lv2.id, num: 1 }] }),
    ).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'foods_not_allowed', foodsId: lv2.id },
    });
    await expect(
      t.game.town.levelTicket(a, { level: 1, picks: [{ foodsId: rare1.id, num: 1 }] }),
    ).rejects.toMatchObject({ params: { reason: 'foods_not_allowed' } });
    await expect(
      t.game.town.levelTicket(a, { level: 1, picks: [{ foodsId: common[0]!.id, num: 2 }] }),
    ).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: gid('一级食材兑换券'), need: 2, have: 1 },
    });
    expect(await goodsNum(t, a.restaurantId, gid('一级食材兑换券'))).toBe(1);
  });

  it('神秘券：换 1 个 7 级食材；573 不能换', async () => {
    const a = await newRestaurant(t, { goods: { [GOODS.mysteryFoodExchange]: 2 } });
    expect((await t.game.town.mysteryTicket(a, { foodsId: mystery.id })).data).toEqual({
      foods: [{ foodsId: mystery.id, num: 1 }],
    });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryFoodExchange)).toBe(1);
    await expect(t.game.town.mysteryTicket(a, { foodsId: fid('神秘宁乡猪') })).rejects.toMatchObject({
      params: { reason: 'foods_not_allowed' },
    });
  });
});
