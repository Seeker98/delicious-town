import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';

const config = testConfig();
let t: TestGame;
/** 固定随机数 0.99：概率判定一律失败 */
let unlucky: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  unlucky = await createTestGame({ rng: () => sequenceRng([0.99]) });
});
afterAll(async () => {
  await t.close();
  await unlucky.close();
});
const s = () => t.game.mysterious;
const remnantOf = async (restId: number, mcId: number) =>
  (
    await t.db
      .selectFrom('mc_remnant')
      .select('num')
      .where('rest_id', '=', restId)
      .where('mc_id', '=', mcId)
      .executeTakeFirst()
  )?.num ?? 0;
const giveRemnant = (ctx: RestCtx, mcId: number, num: number) =>
  t.db.insertInto('mc_remnant').values({ rest_id: ctx.restaurantId, mc_id: mcId, num }).execute();

describe('鉴定（规格书 04 §4.3）', () => {
  it('蟹黄堡秘方 100% 成功：3~5 级残卷，每次 1~2 张；扣神秘食谱和秘方；同一道菜只有一个事件', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 162: 10, 165: 10 } });
    const r = await s().appraise(ctx, { toolId: 165, times: 10, noRetry: false });
    expect(r.data.results).toHaveLength(10);
    let total = 0;
    for (const x of r.data.results) {
      expect(x.ok).toBe(true);
      const lv = config.requireMc(x.mcId!).level;
      expect(lv).toBeGreaterThanOrEqual(3);
      expect(lv).toBeLessThanOrEqual(5);
      expect(x.num).toBeGreaterThanOrEqual(1);
      expect(x.num).toBeLessThanOrEqual(2);
      total += x.num!;
    }
    expect(await goodsNum(t, ctx.restaurantId, 162)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 165)).toBe(0);
    const gains = r.events.filter((e) => e.kind === 'remnant');
    expect(new Set(gains.map((e) => e.id)).size).toBe(gains.length);
    expect(gains.reduce((n, e) => n + e.num, 0)).toBe(total);
    const rows = await t.db
      .selectFrom('mc_remnant')
      .select('num')
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(rows.reduce((n, x) => n + x.num, 0)).toBe(total);
  });

  it('失败只扣道具，给一句文案', async () => {
    const ctx = await newRestaurant(unlucky, { patch: { star_level: 1 }, goods: { 162: 2, 163: 2 } });
    const r = await unlucky.game.mysterious.appraise(ctx, { toolId: 163, times: 2, noRetry: false });
    expect(r.data.results.every((x) => !x.ok && typeof x.text === 'string')).toBe(true);
    expect(await goodsNum(unlucky, ctx.restaurantId, 163)).toBe(0);
  });

  it('0 星报 REQUIREMENT_NOT_MET；不是鉴定道具报 VALIDATION_FAILED；神秘食谱不够时秘方也不扣', async () => {
    const zero = await newRestaurant(t, { goods: { 162: 1, 165: 1 } });
    await expect(s().appraise(zero, { toolId: 165, times: 1, noRetry: false })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 162: 1, 165: 5 } });
    await expect(s().appraise(ctx, { toolId: 85, times: 1, noRetry: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_appraise_tool' },
    });
    await expect(s().appraise(ctx, { toolId: 165, times: 2, noRetry: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 162 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 165)).toBe(5);
  });

  it('鉴定 99 次：流水条数不超过 残卷种数 + 2（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 162: 99, 165: 99 } });
    await s().appraise(ctx, { toolId: 165, times: 99, noRetry: false });
    const kinds = await t.db
      .selectFrom('mc_remnant')
      .select('mc_id')
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    const ledger = await t.db
      .selectFrom('ledger')
      .select('kind')
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(ledger.length).toBeLessThanOrEqual(kinds.length + 2);
  });
});

describe('残卷', () => {
  it('出售得 单价×张数 银币；分解得同数量的对应等级碎片；不够时 NOT_ENOUGH remnant', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 } });
    await giveRemnant(ctx, 1, 5);
    const sold = await s().sellRemnant(ctx, { mcId: 1, num: 2 });
    expect(sold.data.coin).toBe(config.requireMc(1).coin * 2);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(config.requireMc(1).coin * 2);
    await s().decomposeRemnant(ctx, { mcId: 1, num: 3 });
    expect(await goodsNum(t, ctx.restaurantId, 180 + config.requireMc(1).level)).toBe(3);
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(0);
    await expect(s().sellRemnant(ctx, { mcId: 1, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'remnant', id: 1, need: 1, have: 0 },
    });
  });

  it('3 张学会：写入熟练度 1 级；学过再学报 mc_learned 且不扣残卷；未知特色菜 NOT_FOUND', async () => {
    const ctx = await newRestaurant(t);
    await giveRemnant(ctx, 1, 7);
    await s().learn(ctx, { mcId: 1 });
    const row = await t.db
      .selectFrom('rest_mc')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ mc_id: 1, curlevel: 1, curexp: 0, way: 1 });
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(4);
    await expect(s().learn(ctx, { mcId: 1 })).rejects.toMatchObject({ params: { reason: 'mc_learned' } });
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(4);
    await expect(s().learn(ctx, { mcId: 99999 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('概览、目录、任务、功能开关', () => {
  it('概览：已学（熟练度名称和下一级）、残卷、鉴定道具和持有数', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 2 }, goods: { 162: 3, 165: 1, 491: 4 } });
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: 2, way: 1 }).execute();
    await giveRemnant(ctx, 3, 2);
    const o = await s().overview(ctx);
    expect(o).toMatchObject({ star: 2, recipes: 3, cookies: 4, current: null, starBook: false });
    expect(o.learned).toEqual([
      {
        mcId: 2,
        curlevel: 1,
        levelName: '初学',
        curexp: 0,
        expNext: 200,
        trialWorth: 0,
        trialExp: 0,
        way: 1,
      },
    ]);
    expect(o.remnants).toEqual([{ mcId: 3, num: 2 }]);
    expect(o.tools.find((x) => x.goodsId === 165)).toEqual({
      goodsId: 165,
      num: 1,
      min: 3,
      max: 5,
      rate: 1,
      perNum: 2,
    });
    expect(o.cookNums).toEqual([1, 5, 10, 15, 25, 50]);
  });

  it('目录带特色菜（名称、等级、道、食材）', () => {
    const m = t.game.world.catalog().mysterious!.find((x) => x.id === 1)!;
    expect(m).toMatchObject({ name: '秘·仿膳饽饽', level: 4, road: 1, foods: [390, 412, 261] });
  });

  it('主线第 22 步「鉴定一次神秘食谱」、第 23 步「学会一道特色菜」不再跳过', async () => {
    const ctx = await newRestaurant(t, {
      patch: { star_level: 1, main_task_step: 22 },
      goods: { 162: 1, 165: 1 },
    });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 22, key: 'mc.appraise', done: false });
    await s().appraise(ctx, { toolId: 165, times: 1, noRetry: false });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 22, done: true });
    const ctx2 = await newRestaurant(t, { patch: { main_task_step: 23 } });
    await giveRemnant(ctx2, 1, 3);
    await s().learn(ctx2, { mcId: 1 });
    expect((await t.game.task.tasks(ctx2)).main).toMatchObject({
      step: 23,
      key: 'mc.learned',
      progress: 1,
      done: true,
    });
  });

  it('区服关闭 mysterious：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 162: 1, 165: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { mysterious: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(s().overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(s().appraise(ctx, { toolId: 165, times: 1, noRetry: false })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});

describe('一键学习（问题记录：学习按钮不显眼，想要一键学习）', () => {
  it('学会所有残卷 ≥3 张且没学过的特色菜，各扣 3 张；不够 3 张和已学的不动', async () => {
    const ctx = await newRestaurant(t);
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: 4, way: 1 }).execute();
    await giveRemnant(ctx, 1, 3);
    await giveRemnant(ctx, 2, 7);
    await giveRemnant(ctx, 3, 2);
    await giveRemnant(ctx, 4, 5);
    const r = await s().learnAll(ctx);
    expect(r.data.learned.sort((a, b) => a - b)).toEqual([1, 2]);
    const learned = await t.db
      .selectFrom('rest_mc')
      .select('mc_id')
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(learned.map((x) => x.mc_id).sort((a, b) => a - b)).toEqual([1, 2, 4]);
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(0);
    expect(await remnantOf(ctx.restaurantId, 2)).toBe(4);
    expect(await remnantOf(ctx.restaurantId, 3)).toBe(2);
    expect(await remnantOf(ctx.restaurantId, 4)).toBe(5);
  });

  it('没有能学的时报 INVALID_STATE nothing_to_learn', async () => {
    const ctx = await newRestaurant(t);
    await giveRemnant(ctx, 3, 2);
    await expect(s().learnAll(ctx)).rejects.toMatchObject({ params: { reason: 'nothing_to_learn' } });
  });
});
