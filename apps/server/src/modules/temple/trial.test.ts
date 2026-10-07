import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { eventCount } from '../../../test/quests';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { GOODS } from '@dt/config';
import { fid } from '../../../test/items';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：试炼必成功，加成取 1 */
let win: TestGame;
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

const lvl = (n: number) => config.bundle.mysteriousCookbooks.filter((m) => m.level === n);
const MC3 = lvl(3)[0]!; // 食材 262、310、400
const MC4 = lvl(4)[0]!;
const MC6 = lvl(6)[0]!;
const RARE = fid('长胡椒'); // 5 级，odds 70
const COMMON = fid('辽参'); // 5 级，odds 100

async function ready(g: TestGame, learned: number[] = [MC3.id], patch: Record<string, number> = {}) {
  const foods = Object.fromEntries([RARE, COMMON, ...MC3.foods].map((f) => [f, 5]));
  const ctx = await newRestaurant(g, {
    patch: { star_level: 1, coin: 1_000_000, ...patch },
    goods: { [GOODS.tentacle]: 2 },
    foods,
  });
  for (const id of learned)
    await g.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: id, way: 1 }).execute();
  return ctx;
}
const mcRow = (g: TestGame, restId: number, mcId: number) =>
  g.db
    .selectFrom('rest_mc')
    .selectAll()
    .where('rest_id', '=', restId)
    .where('mc_id', '=', mcId)
    .executeTakeFirst();

describe('试炼准备（设计文档 裁定 1、7）', () => {
  it('冥想：免费得勋章 327；只从已学的 ≤5 级菜里抽；准备好时不能再准备', async () => {
    const ctx = await ready(win, [MC3.id, MC6.id]);
    const r = await win.game.temple.prepareTrial(ctx, { way: 2 });
    expect(r.data.mcId).toBe(MC3.id);
    expect(await goodsNum(win, ctx.restaurantId, GOODS.meditation)).toBe(1);
    const row = await win.db
      .selectFrom('rest_trial')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ mc_id: MC3.id, way: 2 });
    await expect(win.game.temple.prepareTrial(ctx, { way: 2 })).rejects.toMatchObject({
      params: { reason: 'trial_ready' },
    });
  });

  it('注射花 25 万银币并得勋章 326；没学 ≤5 级特色菜报 mc_count', async () => {
    const ctx = await ready(t, [MC3.id], { coin: 300_000 });
    await t.game.temple.prepareTrial(ctx, { way: 1 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(50_000);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.creativePotion)).toBe(1);
    const only6 = await ready(t, [MC6.id]);
    await expect(t.game.temple.prepareTrial(only6, { way: 2 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'mc_count', need: 1 },
    });
  });

  it('换对象：不指定花 2 万银币；用触手指定已学的菜；没学或 >5 级的报 mc_not_learned', async () => {
    const ctx = await ready(win, [MC3.id, MC4.id, MC6.id]);
    await win.game.temple.prepareTrial(ctx, { way: 2 });
    const a = await win.game.temple.refreshTrial(ctx, {});
    expect([MC3.id, MC4.id]).toContain(a.data.mcId);
    expect((await restRow(win, ctx.restaurantId)).coin).toBe(1_000_000 - 20_000);
    const b = await win.game.temple.refreshTrial(ctx, { mcId: MC4.id });
    expect(b.data.mcId).toBe(MC4.id);
    expect(await goodsNum(win, ctx.restaurantId, GOODS.tentacle)).toBe(1);
    for (const id of [lvl(5)[0]!.id, MC6.id])
      await expect(win.game.temple.refreshTrial(ctx, { mcId: id })).rejects.toMatchObject({
        params: { reason: 'mc_not_learned' },
      });
  });
});

describe('试炼（规格书 09 §9.4）', () => {
  it('成功：扣 1 万银币、主辅食材各 1、这道菜的食材各 1；主稀有辅不稀有 → 价值 +1、经验 +1；熟练度 +800 升到 3 级', async () => {
    const ctx = await ready(win);
    await win.game.temple.prepareTrial(ctx, { way: 2 });
    const r = await win.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: COMMON });
    expect(r.data).toMatchObject({ success: true, addWorth: 1, addExp: 1, proficiency: 800, curlevel: 3 });
    expect(await mcRow(win, ctx.restaurantId, MC3.id)).toMatchObject({
      trial_worth: 1,
      trial_exp: 1,
      curexp: 800,
      curlevel: 3,
    });
    expect((await restRow(win, ctx.restaurantId)).coin).toBe(1_000_000 - 10_000);
    for (const f of [RARE, COMMON, ...MC3.foods])
      expect((await foodNum(win, ctx.restaurantId, f)).num).toBe(4);
    const c = await win.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'temple.trial')
      .executeTakeFirst();
    expect(c?.count).toBe(1);
    // 支线“守护兽”的“试炼成功”（问题记录 515）
    expect(await eventCount(win, ctx.restaurantId, 'temple.trial.success')).toBe(1);
  });

  it('价值上限 30（用户 2026-10-07 定，原来 50）：以前攒到 45 的，成功一次压到 30，不算负的增加', async () => {
    const ctx = await ready(win);
    await win.db
      .updateTable('rest_mc')
      .set({ trial_worth: 45 })
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    await win.game.temple.prepareTrial(ctx, { way: 2 });
    const r = await win.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: RARE });
    expect(r.data).toMatchObject({ success: true, addWorth: 0 });
    expect(await mcRow(win, ctx.restaurantId, MC3.id)).toMatchObject({ trial_worth: 30 });
  });

  it('价值 30、经验 150 到上限后不再加；主辅同一种时扣 2 个', async () => {
    const ctx = await ready(win);
    await win.db
      .updateTable('rest_mc')
      .set({ trial_worth: 30, trial_exp: 150 })
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    await win.game.temple.prepareTrial(ctx, { way: 2 });
    const r = await win.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: RARE });
    expect(r.data).toMatchObject({ success: true, addWorth: 0, addExp: 0 });
    expect((await foodNum(win, ctx.restaurantId, RARE)).num).toBe(3);
  });

  it('失败：只扣花费，没有加成', async () => {
    const ctx = await ready(lose);
    await lose.game.temple.prepareTrial(ctx, { way: 2 });
    const r = await lose.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: COMMON });
    expect(r.data).toMatchObject({ success: false, addWorth: 0, addExp: 0, proficiency: 0 });
    expect(await eventCount(lose, ctx.restaurantId, 'temple.trial.success')).toBe(0);
    expect(await mcRow(lose, ctx.restaurantId, MC3.id)).toMatchObject({
      trial_worth: 0,
      trial_exp: 0,
      curexp: 0,
    });
  });

  it('勋章过期报 no_trial；对象后来被遗忘报 mc_not_learned，什么都不扣（Review Focus 5）', async () => {
    const ctx = await ready(t);
    await t.game.temple.prepareTrial(ctx, { way: 2 });
    await t.db.deleteFrom('rest_mc').where('rest_id', '=', ctx.restaurantId).execute();
    await expect(
      t.game.temple.startTrial(ctx, { mainFoodsId: RARE, subFoodsId: COMMON }),
    ).rejects.toMatchObject({
      params: { reason: 'mc_not_learned' },
    });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1_000_000);
    const ctx2 = await ready(t);
    await t.game.temple.prepareTrial(ctx2, { way: 2 });
    t.clock.advance(2 * 3600_000);
    await expect(
      t.game.temple.startTrial(ctx2, { mainFoodsId: RARE, subFoodsId: COMMON }),
    ).rejects.toMatchObject({
      params: { reason: 'no_trial' },
    });
  });

  it('不认识的食材报 VALIDATION_FAILED bad_food', async () => {
    const ctx = await ready(t);
    await t.game.temple.prepareTrial(ctx, { way: 2 });
    await expect(
      t.game.temple.startTrial(ctx, { mainFoodsId: 999999, subFoodsId: COMMON }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'bad_food' },
    });
  });
});
