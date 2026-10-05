import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { grantGoods } from '../store/grant';
import { streetMysteriousRate } from './explore';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：必成功、必出神秘食材 */
let win: TestGame;
/** 随机数固定 0.99：必迷路 */
let lose: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
  lose = await createTestGame({ rng: () => sequenceRng([0.99]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
  await lose.close();
});
const sum = (xs: Array<{ num: number }>) => xs.reduce((n, x) => n + x.num, 0);

describe('探险（规格书 09 §9.2）', () => {
  it('成功：扣图和体力；每次 1 个神秘食材 + 5 个普通食材（5 级 1、4 级 4）；发新闻；活跃按次数计', async () => {
    const ctx = await newRestaurant(win, { patch: { strength: 100 }, goods: { [gid('探险图')]: 5 } });
    const r = await win.game.temple.explore(ctx, { goodsId: gid('探险图'), times: 3 });
    expect(r.data).toMatchObject({ success: 3, fail: 0, exp: 0 });
    expect(sum(r.data.rare)).toBe(3);
    expect(sum(r.data.foods)).toBe(15);
    for (const f of r.data.foods) expect([4, 5]).toContain(config.requireFood(f.foodsId).level);
    expect(await goodsNum(win, ctx.restaurantId, gid('探险图'))).toBe(2);
    expect((await restRow(win, ctx.restaurantId)).strength).toBe(94);
    const news = await win.db
      .selectFrom('news')
      .select('type')
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(news.map((n) => n.type)).toContain('temple.explore.rare');
    const c = await win.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'temple.explore')
      .executeTakeFirst();
    expect(c?.count).toBe(3);
  });

  it('煤油灯：经验 = 每次体力 × 餐厅等级 × (成功×5 + 失败×2)', async () => {
    const ctx = await newRestaurant(win, {
      patch: { strength: 100, level: 10 },
      goods: { [gid('探险图')]: 2 },
    });
    await grantGoods(win.db, config, ctx.restaurantId, GOODS.lamp, 1, new Date());
    const r = await win.game.temple.explore(ctx, { goodsId: gid('探险图'), times: 2 });
    expect(r.data.exp).toBe(2 * 10 * (2 * 5));
  });

  it('全部迷路：只扣图和体力，没有食材', async () => {
    const ctx = await newRestaurant(lose, { patch: { strength: 100 }, goods: { [gid('探险图')]: 2 } });
    const r = await lose.game.temple.explore(ctx, { goodsId: gid('探险图'), times: 2 });
    expect(r.data).toEqual({ success: 0, fail: 2, rare: [], foods: [], exp: 0 });
    expect(await goodsNum(lose, ctx.restaurantId, gid('探险图'))).toBe(0);
  });

  it('高级探险图 + 探险者秘籍：额外 2 个 3 级食材', async () => {
    const ctx = await newRestaurant(win, { patch: { strength: 100 }, goods: { [GOODS.mapHigh]: 1 } });
    await grantGoods(win.db, config, ctx.restaurantId, GOODS.exploreBook, 1, new Date());
    const r = await win.game.temple.explore(ctx, { goodsId: GOODS.mapHigh, times: 1 });
    // awardNum = 1 + 10 = 11：5 级 2、4 级 8，再加 3 级 2
    expect(sum(r.data.foods)).toBe(12);
    const l3 = r.data.foods.filter((f) => config.requireFood(f.foodsId).level === 3);
    expect(sum(l3)).toBe(2);
  });

  it('体力不够：报 NOT_ENOUGH strength，探险图不扣（Review Focus 2）', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 1 }, goods: { [gid('探险图')]: 2 } });
    await expect(t.game.temple.explore(ctx, { goodsId: gid('探险图'), times: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'strength' },
    });
    expect(await goodsNum(t, ctx.restaurantId, gid('探险图'))).toBe(2);
  });

  it('不是探险图报 VALIDATION_FAILED not_map', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('金币')]: 1 } });
    await expect(t.game.temple.explore(ctx, { goodsId: gid('金币'), times: 1 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_map' },
    });
  });

  it('主线「探险一次」', async () => {
    const ctx = await newRestaurant(t, { patch: { strength: 100 }, goods: { [gid('探险图')]: 1 } });
    await showQuest(t, ctx.restaurantId, 2085);
    expect(questIn(await t.game.task.tasks(ctx), 2085)).toMatchObject({
      key: 'temple.explore',
      done: false,
    });
    await t.game.temple.explore(ctx, { goodsId: gid('探险图'), times: 1 });
    expect(questIn(await t.game.task.tasks(ctx), 2085)).toMatchObject({ done: true });
  });
});

describe('街道勋章的神秘食材概率（问题记录 284）', () => {
  it('摩洛哥街 +2%，别的街 0', () => {
    expect(streetMysteriousRate(config, 24)).toBeCloseTo(0.02);
    expect(streetMysteriousRate(config, 1)).toBe(0);
  });
});
