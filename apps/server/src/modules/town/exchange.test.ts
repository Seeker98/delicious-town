import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { listNews } from '../news/news';

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

describe('镇长兑换（设计文档 §3.6）', () => {
  it('兑换页：73 项、持有数、已兑次数、两种券和可换食材', async () => {
    const a = await newRestaurant(t, { goods: { 180: 10, 241: 2, 20: 1 } });
    const v = await t.game.town.exchangeView(a);
    expect(v.items).toHaveLength(73);
    expect(v.items.find((x) => x.id === 2)).toEqual({
      id: 2,
      category: 'bg',
      goodsId: 238,
      num: 1,
      need: [{ goodsId: 180, num: 8, have: 10 }],
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
    const a = await newRestaurant(t, { goods: { 180: 20 } });
    expect((await t.game.town.exchange(a, { id: 2, num: 1 })).data).toEqual({ goodsId: 238, num: 1 });
    expect(await goodsNum(t, a.restaurantId, 180)).toBe(12);
    expect(await goodsNum(t, a.restaurantId, 238)).toBe(1);
    const [n] = await listNews(t.db, a.shardId, { limit: 1, only: ['town.exchange'] });
    expect(n).toMatchObject({ restId: a.restaurantId, params: { exchangeId: 2, goodsId: 238, num: 1 } });
    await expect(t.game.town.exchange(a, { id: 2, num: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'town_exchange', max: 1, used: 1 },
    });
    expect((await t.game.town.exchangeView(a)).items.find((x) => x.id === 2)!.used).toBe(1);
  });

  it('一次兑多份：限次项超出上限整单拒绝；材料按份数不够时什么都不扣', async () => {
    const a = await newRestaurant(t, { goods: { 180: 5 } });
    await expect(t.game.town.exchange(a, { id: 2, num: 2 })).rejects.toMatchObject({
      params: { what: 'town_exchange', max: 1, used: 0 },
    });
    await expect(t.game.town.exchange(a, { id: 1, num: 3 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 180, need: 6, have: 5 },
    });
    expect(await goodsNum(t, a.restaurantId, 180)).toBe(5);
    expect(await goodsNum(t, a.restaurantId, 139)).toBe(0);
    expect((await t.game.town.exchange(a, { id: 1, num: 2 })).data).toEqual({ goodsId: 139, num: 2 });
    expect(await goodsNum(t, a.restaurantId, 180)).toBe(1);
  });

  it('份数超过上限、兑换项不存在', async () => {
    const a = await newRestaurant(t, { goods: { 180: 500 } });
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
    const a = await newRestaurant(t, { goods: { 241: 3 } });
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
    expect(await goodsNum(t, a.restaurantId, 241)).toBe(0);
    expect((await foodNum(t, a.restaurantId, x!.id)).num).toBe(2);
  });

  it('等级不符、不是普通食材、券不够都拒绝，不扣券', async () => {
    const a = await newRestaurant(t, { goods: { 241: 1 } });
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
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'goods', id: 241, need: 2, have: 1 } });
    expect(await goodsNum(t, a.restaurantId, 241)).toBe(1);
  });

  it('神秘券：换 1 个 7 级食材；573 不能换', async () => {
    const a = await newRestaurant(t, { goods: { 20: 2 } });
    expect((await t.game.town.mysteryTicket(a, { foodsId: mystery.id })).data).toEqual({
      foods: [{ foodsId: mystery.id, num: 1 }],
    });
    expect(await goodsNum(t, a.restaurantId, 20)).toBe(1);
    await expect(t.game.town.mysteryTicket(a, { foodsId: 573 })).rejects.toMatchObject({
      params: { reason: 'foods_not_allowed' },
    });
  });
});
