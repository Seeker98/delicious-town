import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：必中、必暴击、掉落必中 */
let win: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
});

describe('守护兽（规格书 09 §9.1）', () => {
  it('极速飞弹两发击败 1 星守护兽：只扣 2 枚；暴击掉礼券和探险图；击败奖励；再打报 guardian_down（Review Focus 1）', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 1 }, goods: { 17: 5 } });
    const r = await win.game.temple.missile(ctx, { goodsId: 17, num: 99 });
    expect(r.data.shots).toHaveLength(2);
    expect(r.data.shots.every((s) => s.hit && s.crit && s.damage === 10000)).toBe(true);
    expect(r.data).toMatchObject({ hpMax: 15000, hpLeft: 0, killed: true });
    expect(await goodsNum(win, ctx.restaurantId, 17)).toBe(3);
    expect(r.data.drops).toMatchObject({ tickets: 2, maps: 2, seals: 0, dtTickets: 200 });
    expect(await goodsNum(win, ctx.restaurantId, 1)).toBe(2);
    expect(await goodsNum(win, ctx.restaurantId, 170)).toBe(2);
    expect(r.data.drops.rare).not.toBeNull();
    expect(config.requireFood(r.data.drops.rare!).level).toBe(7);
    expect(r.data.drops.foods.reduce((n, f) => n + f.num, 0)).toBe(1 + 15 + 25 + 55);
    await expect(win.game.temple.missile(ctx, { goodsId: 17, num: 1 })).rejects.toMatchObject({
      params: { reason: 'guardian_down' },
    });
    expect(await goodsNum(win, ctx.restaurantId, 17)).toBe(3);
  });

  it('星级决定血量；伤害当天累计；0 星不能打', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 2 }, goods: { 18: 3 } });
    const r = await t.game.temple.missile(ctx, { goodsId: 18, num: 3 });
    const dealt = r.data.shots.reduce((n, s) => n + s.damage, 0);
    expect(r.data).toMatchObject({ hpMax: 20000, hpLeft: 20000 - dealt, killed: false });
    expect((await t.game.temple.overview(ctx)).guardian).toEqual({
      hpMax: 20000,
      hpLeft: 20000 - dealt,
      killed: false,
    });
    const zero = await newRestaurant(t, { goods: { 18: 1 } });
    await expect(t.game.temple.missile(zero, { goodsId: 18, num: 1 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
  });

  it('捕梦网：暴击时按极速飞弹的概率掉厨神玉玺', async () => {
    const ctx = await newRestaurant(win, { patch: { star_level: 3 }, goods: { 17: 1 } });
    await grantGoods(win.db, config, ctx.restaurantId, 468, 1, new Date());
    const r = await win.game.temple.missile(ctx, { goodsId: 17, num: 1 });
    expect(r.data.drops.seals).toBe(1);
    expect(await goodsNum(win, ctx.restaurantId, 164)).toBe(1);
  });

  it('不是飞弹报 VALIDATION_FAILED；没有飞弹报 NOT_ENOUGH', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    await expect(t.game.temple.missile(ctx, { goodsId: 85, num: 1 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_missile' },
    });
    await expect(t.game.temple.missile(ctx, { goodsId: 18, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 18 },
    });
  });

  it('主线第 25 步「攻击一次守护兽」不再跳过', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1, main_task_step: 25 }, goods: { 18: 1 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({
      step: 25,
      key: 'temple.missile',
      done: false,
    });
    await t.game.temple.missile(ctx, { goodsId: 18, num: 1 });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 25, done: true });
  });
});
