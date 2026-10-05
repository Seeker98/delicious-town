import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { grantGoods } from '../store/grant';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0.5：结果可复现 */
let fixed: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  fixed = await createTestGame({ rng: () => sequenceRng([0.5]) });
});
afterAll(async () => {
  await t.close();
  await fixed.close();
});

const MC = 1; // 秘·仿膳饽饽：4 级，食材 390、412、261
const foodsOf = (id: number) => config.requireMc(id).foods;
async function cookReady(
  g: TestGame,
  opts: { mcId?: number; star?: number; each?: number; goods?: Record<number, number> } = {},
) {
  const mcId = opts.mcId ?? MC;
  const foods = Object.fromEntries(foodsOf(mcId).map((f) => [f, opts.each ?? 10]));
  const ctx = await newRestaurant(g, { patch: { star_level: opts.star ?? 1 }, foods, goods: opts.goods });
  await g.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: mcId, way: 1 }).execute();
  return ctx;
}
const cookRow = (g: TestGame, id: number) =>
  g.db.selectFrom('mc_cook').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('预览', () => {
  it('食材持有数和每个批数够不够', async () => {
    const ctx = await cookReady(t, { each: 7 });
    const p = await t.game.mysterious.preview(ctx, MC);
    expect(p).toMatchObject({ mcId: MC, learned: true, cooking: false, cookies: 0 });
    expect(p.foods).toEqual(foodsOf(MC).map((foodsId) => ({ foodsId, have: 7 })));
    expect(p.cookNums).toEqual([
      { n: 1, ok: true },
      { n: 5, ok: true },
      { n: 10, ok: false },
      { n: 15, ok: false },
      { n: 25, ok: false },
      { n: 50, ok: false },
    ]);
  });
});

describe('烹制（规格书 04 §4.5）', () => {
  it('扣每种食材 ×批数；写入在售批次和餐厅指针；新闻、活跃计数、熟练度', async () => {
    const ctx = await cookReady(t);
    const r = await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 5, cookie: false });
    for (const f of foodsOf(MC)) expect((await foodNum(t, ctx.restaurantId, f)).num).toBe(5);
    const c = await cookRow(t, r.data.cook.id);
    expect(c).toMatchObject({ rest_id: ctx.restaurantId, mc_id: MC, level: 4, cook_num: 5, ended_at: null });
    expect(c.left_num).toBe(c.total_num);
    expect(c.total_num).toBeGreaterThan(0);
    expect(c.price).toBeGreaterThan(0);
    expect((await restRow(t, ctx.restaurantId)).mc_cook_id).toBe(c.id);
    const news = await t.db
      .selectFrom('news')
      .select('type')
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(news.map((n) => n.type)).toContain('mc.cook');
    const counter = await t.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'mc.cook')
      .executeTakeFirst();
    expect(counter?.count).toBe(1);
    const m = await t.db
      .selectFrom('rest_mc')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(m.curexp).toBe(r.data.proficiency);
  });

  it('批数不在列表 VALIDATION_FAILED；没学、0 星、已在售、食材不够都报错，且食材一个都不扣', async () => {
    const ctx = await cookReady(t, { each: 3 });
    await expect(t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 3, cookie: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'cook_num' },
    });
    await expect(t.game.mysterious.cook(ctx, { mcId: 2, cookNum: 1, cookie: false })).rejects.toMatchObject({
      params: { reason: 'mc_not_learned' },
    });
    await expect(t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 5, cookie: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'foods' },
    });
    for (const f of foodsOf(MC)) expect((await foodNum(t, ctx.restaurantId, f)).num).toBe(3);
    const zero = await cookReady(t, { star: 0 });
    await expect(t.game.mysterious.cook(zero, { mcId: MC, cookNum: 1, cookie: false })).rejects.toMatchObject(
      {
        code: 'REQUIREMENT_NOT_MET',
        params: { reason: 'star' },
      },
    );
    await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: false });
    await expect(t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: false })).rejects.toMatchObject({
      params: { reason: 'mc_cooking' },
    });
    for (const f of foodsOf(MC)) expect((await foodNum(t, ctx.restaurantId, f)).num).toBe(2);
  });

  it('幸运饼干：每批扣 1 个；不够时报错', async () => {
    const ctx = await cookReady(t, { goods: { [GOODS.luckyCookie]: 3 } });
    await expect(t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 5, cookie: true })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: GOODS.luckyCookie },
    });
    await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: true });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.luckyCookie)).toBe(2);
  });

  it('烹饪魔书：随机一种非 7 级食材不扣（rng 0.5 → 第 2 种）', async () => {
    const ctx = await cookReady(fixed);
    await grantGoods(fixed.db, config, ctx.restaurantId, gid('烹饪魔书'), 1, new Date());
    await fixed.game.mysterious.cook(ctx, { mcId: MC, cookNum: 5, cookie: false });
    const [a, b, c] = foodsOf(MC);
    expect((await foodNum(fixed, ctx.restaurantId, a!)).num).toBe(5);
    expect((await foodNum(fixed, ctx.restaurantId, b!)).num).toBe(10);
    expect((await foodNum(fixed, ctx.restaurantId, c!)).num).toBe(5);
  });

  it('6 级特色菜必得海绵宝宝；熟练度到 200 升到 2 级', async () => {
    const six = config.bundle.mysteriousCookbooks.find((m) => m.level === 6)!;
    const ctx = await cookReady(t, { mcId: six.id });
    await t.db.updateTable('rest_mc').set({ curexp: 199 }).where('rest_id', '=', ctx.restaurantId).execute();
    const r = await t.game.mysterious.cook(ctx, { mcId: six.id, cookNum: 1, cookie: false });
    expect(r.data.bob).toBe(true);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.spongeBob)).toBe(1);
    expect(r.data).toMatchObject({ curlevel: 2, levelUp: true });
  });
});

describe('倒掉', () => {
  it('结束当前批次、清空指针；没有在售时报 no_cooking', async () => {
    const ctx = await cookReady(t);
    const r = await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: false });
    await t.game.mysterious.dump(ctx);
    expect(await cookRow(t, r.data.cook.id)).toMatchObject({ end_reason: 'dumped' });
    expect((await restRow(t, ctx.restaurantId)).mc_cook_id).toBeNull();
    await expect(t.game.mysterious.dump(ctx)).rejects.toMatchObject({ params: { reason: 'no_cooking' } });
  });
});

describe('概览里的当前在售', () => {
  it('烹制后 current 有值', async () => {
    const ctx: RestCtx = await cookReady(t);
    await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: false });
    const o = await t.game.mysterious.overview(ctx);
    expect(o.current).toMatchObject({ mcId: MC });
    // 卖给顾客时的倍率（问题记录 412）：这道是 4 级，×3.2
    expect(o.saleRate).toBe(3.2);
  });
});
