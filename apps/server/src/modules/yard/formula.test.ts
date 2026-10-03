import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数 0：鉴定必成功、抽到 1 号配方、主碎片；合成每份暴击 +1 */
let win: TestGame;
/** 随机数 0.99：鉴定必失败 */
let lose: TestGame;
/** 成功、1 号配方、辅碎片（0.5），星月密卷转换用 0.1 */
let moon: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
  lose = await createTestGame({ rng: () => sequenceRng([0.99]) });
  moon = await createTestGame({ rng: () => sequenceRng([0, 0, 0.5, 0.1]) });
});
afterAll(async () => {
  for (const g of [t, win, lose, moon]) await g.close();
});

const rowOf = (g: TestGame, restId: number, formulaId = 1) =>
  g.db
    .selectFrom('rest_formula')
    .selectAll()
    .where('rest_id', '=', restId)
    .where('formula_id', '=', formulaId)
    .executeTakeFirst();
const setRow = (g: TestGame, restId: number, v: { main_num?: number; sub_num?: number; learned?: boolean }) =>
  g.db
    .insertInto('rest_formula')
    .values({ rest_id: restId, formula_id: 1, ...v })
    .execute();
async function counter(g: TestGame, restId: number, key: string) {
  const r = await g.db
    .selectFrom('event_counter')
    .select('count')
    .where('rest_id', '=', restId)
    .where('key', '=', key)
    .executeTakeFirst();
  return r?.count ?? 0;
}

describe('配方鉴定（规格书 09 §9.3，裁定 8、9）', () => {
  it('扣厨神玉玺和玄奥配方各 times 个；成功时按 odds 抽配方，rand < 0.25 得主碎片；活跃按次数；支线 114 完成', async () => {
    const ctx = await newRestaurant(win, { goods: { 164: 3, 464: 3 } });
    await showQuest(win, ctx.restaurantId, 3142);
    expect(questIn(await win.game.task.tasks(ctx), 3142)).toMatchObject({
      href: '/yard',
      done: false,
    });
    const r = await win.game.yard.appraiseFormula(ctx, { toolId: 164, times: 2 });
    expect(r.data.results).toEqual([
      { ok: true, formulaId: 1, part: 'main', upgraded: false },
      { ok: true, formulaId: 1, part: 'main', upgraded: false },
    ]);
    expect(await rowOf(win, ctx.restaurantId)).toMatchObject({ main_num: 2, sub_num: 0, learned: false });
    expect(await goodsNum(win, ctx.restaurantId, 164)).toBe(1);
    expect(await goodsNum(win, ctx.restaurantId, 464)).toBe(1);
    expect(await counter(win, ctx.restaurantId, 'formula.appraise')).toBe(2);
    expect(questIn(await win.game.task.tasks(ctx), 3142)).toMatchObject({ done: true });
  });

  it('失败时什么碎片也不得，道具照扣', async () => {
    const ctx = await newRestaurant(lose, { goods: { 164: 1, 464: 1 } });
    const r = await lose.game.yard.appraiseFormula(ctx, { toolId: 164, times: 1 });
    expect(r.data.results).toEqual([{ ok: false }]);
    expect(await rowOf(lose, ctx.restaurantId)).toBeUndefined();
    expect(await goodsNum(lose, ctx.restaurantId, 464)).toBe(0);
  });

  it('星月密卷：已有该配方辅碎片时，辅碎片 rand < 0.2 转成主碎片；没有辅碎片时不转', async () => {
    const has = await newRestaurant(moon, { goods: { 164: 1, 464: 1 } });
    await grantGoods(moon.db, config, has.restaurantId, 465, 1, moon.clock.now);
    await setRow(moon, has.restaurantId, { sub_num: 1 });
    const r1 = await moon.game.yard.appraiseFormula(has, { toolId: 164, times: 1 });
    expect(r1.data.results).toEqual([{ ok: true, formulaId: 1, part: 'main', upgraded: true }]);
    expect(await rowOf(moon, has.restaurantId)).toMatchObject({ main_num: 1, sub_num: 1 });
    const none = await newRestaurant(moon, { goods: { 164: 1, 464: 1 } });
    await grantGoods(moon.db, config, none.restaurantId, 465, 1, moon.clock.now);
    const r2 = await moon.game.yard.appraiseFormula(none, { toolId: 164, times: 1 });
    expect(r2.data.results).toEqual([{ ok: true, formulaId: 1, part: 'sub', upgraded: false }]);
  });

  it('不是配方鉴定道具（星月密卷也不算）报 VALIDATION_FAILED；玄奥配方不够报 NOT_ENOUGH，什么都不扣', async () => {
    const ctx = await newRestaurant(t, { goods: { 164: 2, 464: 1 } });
    for (const toolId of [18, 465]) {
      await expect(t.game.yard.appraiseFormula(ctx, { toolId, times: 1 })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        params: { reason: 'not_formula_tool' },
      });
    }
    await expect(t.game.yard.appraiseFormula(ctx, { toolId: 164, times: 2 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 464, need: 2, have: 1 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 164)).toBe(2);
  });
});

describe('配方学习和分解（规格书 08 §8.5）', () => {
  it('学习：主辅碎片各扣 1；缺辅碎片报 NOT_ENOUGH fragment；已学报 formula_learned', async () => {
    const ctx = await newRestaurant(t);
    await setRow(t, ctx.restaurantId, { main_num: 2 });
    await expect(t.game.yard.learnFormula(ctx, { formulaId: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'fragment', part: 'sub', id: 1, need: 1, have: 0 },
    });
    await t.db
      .updateTable('rest_formula')
      .set({ sub_num: 1 })
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    await t.game.yard.learnFormula(ctx, { formulaId: 1 });
    expect(await rowOf(t, ctx.restaurantId)).toMatchObject({ main_num: 1, sub_num: 0, learned: true });
    await expect(t.game.yard.learnFormula(ctx, { formulaId: 1 })).rejects.toMatchObject({
      params: { reason: 'formula_learned' },
    });
    await expect(t.game.yard.learnFormula(ctx, { formulaId: 999 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'no_formula' },
    });
  });

  it('分解：主碎片 ×3、辅碎片 ×1 换配方精华；不够报 NOT_ENOUGH fragment', async () => {
    const ctx = await newRestaurant(t);
    await setRow(t, ctx.restaurantId, { main_num: 2, sub_num: 3 });
    expect((await t.game.yard.decomposeFormula(ctx, { formulaId: 1, part: 'main', num: 2 })).data).toEqual({
      essence: 6,
    });
    expect((await t.game.yard.decomposeFormula(ctx, { formulaId: 1, part: 'sub', num: 3 })).data).toEqual({
      essence: 3,
    });
    expect(await goodsNum(t, ctx.restaurantId, 470)).toBe(9);
    expect(await rowOf(t, ctx.restaurantId)).toMatchObject({ main_num: 0, sub_num: 0 });
    await expect(
      t.game.yard.decomposeFormula(ctx, { formulaId: 1, part: 'sub', num: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_ENOUGH', params: { kind: 'fragment', part: 'sub', have: 0 } });
  });
});

describe('配方合成（规格书 08 §8.5）', () => {
  /** 1 号配方：主料 438（菜篮）、辅料 431、添加料 551（橱柜），结果 447 */
  async function cook(g: TestGame, opts: { sub?: number; strength?: number } = {}) {
    const ctx = await newRestaurant(g, {
      patch: { strength: opts.strength ?? 100 },
      foods: { 431: opts.sub ?? 5, 551: 5 },
    });
    await setRow(g, ctx.restaurantId, { learned: true });
    await g.db
      .insertInto('yard_basket')
      .values({ rest_id: ctx.restaurantId, foods_id: 438, num: 5 })
      .execute();
    return ctx;
  }
  const basketOf = async (g: TestGame, restId: number) =>
    (
      await g.db
        .selectFrom('yard_basket')
        .select('num')
        .where('rest_id', '=', restId)
        .where('foods_id', '=', 438)
        .executeTakeFirst()
    )?.num ?? 0;

  it('扣体力 3×份、菜篮主料、橱柜辅料和添加料；随机数 0 时每份暴击 +1；结果进橱柜；活跃按份数', async () => {
    const ctx = await cook(win);
    const r = await win.game.yard.composeFormula(ctx, { formulaId: 1, num: 2 });
    expect(r.data).toEqual({ foodsId: 447, num: 4, extra: 2 });
    expect((await restRow(win, ctx.restaurantId)).strength).toBe(94);
    expect(await basketOf(win, ctx.restaurantId)).toBe(3);
    expect((await foodNum(win, ctx.restaurantId, 431)).num).toBe(3);
    expect((await foodNum(win, ctx.restaurantId, 551)).num).toBe(3);
    expect((await foodNum(win, ctx.restaurantId, 447)).num).toBe(4);
    expect(await counter(win, ctx.restaurantId, 'formula.compose')).toBe(2);
  });

  it('没学会报 formula_unlearned；辅料不够报 NOT_ENOUGH foods，体力、菜篮、添加料都不扣（Review Focus 4）', async () => {
    const fresh = await newRestaurant(t);
    await expect(t.game.yard.composeFormula(fresh, { formulaId: 1, num: 1 })).rejects.toMatchObject({
      params: { reason: 'formula_unlearned' },
    });
    const ctx = await cook(t, { sub: 1 });
    await expect(t.game.yard.composeFormula(ctx, { formulaId: 1, num: 2 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'foods', id: 431, need: 2, have: 1 },
    });
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(100);
    expect(await basketOf(t, ctx.restaurantId)).toBe(5);
    expect((await foodNum(t, ctx.restaurantId, 551)).num).toBe(5);
  });

  it('配方页：碎片、已学、原料持有、最多能合成几份（受体力限制）、鉴定道具', async () => {
    const ctx = await cook(t, { strength: 12 });
    await t.db
      .insertInto('store_item')
      .values({ rest_id: ctx.restaurantId, goods_id: 164, num: 3 })
      .execute();
    const v = await t.game.yard.formulas(ctx);
    expect(v.formulas).toHaveLength(56);
    expect(v.formulas.find((f) => f.id === 1)).toMatchObject({
      name: '牡丹籽油配方',
      mainNum: 0,
      subNum: 0,
      learned: true,
      have: { main: 5, sub: 5, add: 5 },
      maxCompose: 4,
    });
    expect(v.formulas.find((f) => f.id === 2)).toMatchObject({ learned: false, maxCompose: 0 });
    expect(v.tools).toEqual([{ goodsId: 164, num: 3, rate: 0.25 }]);
    expect(v).toMatchObject({ scrolls: 0, essence: 0, strength: 12, composeStrength: 3 });
  });
});
