import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';
import type { RestCtx } from '../../core/deps';
import { GOODS } from '@dt/config';
import { fid, gid } from '../../../test/items';

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
    const ctx = await newRestaurant(t, {
      patch: { star_level: 1 },
      goods: { [GOODS.mysteryRecipe]: 10, [GOODS.krabburgerBook]: 10 },
    });
    const r = await s().appraise(ctx, { toolId: GOODS.krabburgerBook, times: 10, noRetry: false });
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
    expect(await goodsNum(t, ctx.restaurantId, GOODS.mysteryRecipe)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, GOODS.krabburgerBook)).toBe(0);
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
    const ctx = await newRestaurant(unlucky, {
      patch: { star_level: 1 },
      goods: { [GOODS.mysteryRecipe]: 2, [gid('美味印章')]: 2 },
    });
    const r = await unlucky.game.mysterious.appraise(ctx, {
      toolId: gid('美味印章'),
      times: 2,
      noRetry: false,
    });
    expect(r.data.results.every((x) => !x.ok && typeof x.text === 'string')).toBe(true);
    // 失败文案带序号，前端按语言显示（问题记录 272）
    expect(r.data.results.every((x) => typeof x.textId === 'number' && x.textId >= 0 && x.textId < 4)).toBe(
      true,
    );
    expect(await goodsNum(unlucky, ctx.restaurantId, gid('美味印章'))).toBe(0);
  });

  it('0 星报 REQUIREMENT_NOT_MET；不是鉴定道具报 VALIDATION_FAILED；神秘食谱不够时秘方也不扣', async () => {
    const zero = await newRestaurant(t, { goods: { [GOODS.mysteryRecipe]: 1, [GOODS.krabburgerBook]: 1 } });
    await expect(
      s().appraise(zero, { toolId: GOODS.krabburgerBook, times: 1, noRetry: false }),
    ).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const ctx = await newRestaurant(t, {
      patch: { star_level: 1 },
      goods: { [GOODS.mysteryRecipe]: 1, [GOODS.krabburgerBook]: 5 },
    });
    await expect(s().appraise(ctx, { toolId: gid('金币'), times: 1, noRetry: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_appraise_tool' },
    });
    await expect(
      s().appraise(ctx, { toolId: GOODS.krabburgerBook, times: 2, noRetry: false }),
    ).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: GOODS.mysteryRecipe },
    });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.krabburgerBook)).toBe(5);
  });

  it('鉴定 99 次：流水条数不超过 残卷种数 + 2（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, {
      patch: { star_level: 1 },
      goods: { [GOODS.mysteryRecipe]: 99, [GOODS.krabburgerBook]: 99 },
    });
    await s().appraise(ctx, { toolId: GOODS.krabburgerBook, times: 99, noRetry: false });
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
    expect(await goodsNum(t, ctx.restaurantId, GOODS.fragmentBase + config.requireMc(1).level)).toBe(3);
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(0);
    await expect(s().sellRemnant(ctx, { mcId: 1, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'remnant', id: 1, need: 1, have: 0 },
    });
  });

  it('碎片兑换指定残卷（问题记录 415）：3 张同级碎片换 1 张这一级任选一道的残卷；不够 NOT_ENOUGH；学过的、不能鉴定出来的不换', async () => {
    const frag = GOODS.fragmentBase + config.requireMc(1).level;
    const ctx = await newRestaurant(t, { goods: { [frag]: 7 } });
    expect((await s().overview(ctx)).fragments[config.requireMc(1).level - 1]).toBe(7);
    await s().exchangeFragments(ctx, { mcId: 1, num: 2 });
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(2);
    expect(await goodsNum(t, ctx.restaurantId, frag)).toBe(1);
    await expect(s().exchangeFragments(ctx, { mcId: 1, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: frag, need: 3, have: 1 },
    });
    const learned = await newRestaurant(t, { goods: { [frag]: 3 } });
    await giveRemnant(learned, 1, 3);
    await s().learn(learned, { mcId: 1 });
    await expect(s().exchangeFragments(learned, { mcId: 1, num: 1 })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'mc_learned' },
    });
    // 被拒绝时碎片一张不少
    expect(await goodsNum(t, learned.restaurantId, frag)).toBe(3);
    const special = config.bundle.mysteriousCookbooks.find((m) => !m.appraisable)!;
    await expect(s().exchangeFragments(ctx, { mcId: special.id, num: 1 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
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
    const ctx = await newRestaurant(t, {
      patch: { star_level: 2 },
      goods: { [GOODS.mysteryRecipe]: 3, [GOODS.krabburgerBook]: 1, [GOODS.luckyCookie]: 4 },
    });
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
    expect(o.tools.find((x) => x.goodsId === GOODS.krabburgerBook)).toEqual({
      goodsId: GOODS.krabburgerBook,
      num: 1,
      min: 3,
      max: 5,
      rate: 1,
      perNum: 2,
      // 怎么获得（问题记录 415）：不在商店卖；黑市 30 钻；随机奖励；昨日冠军
      shopCoin: null,
      blackDiamond: 30,
      award: true,
      champion: true,
    });
    expect(o.tools.find((x) => x.goodsId === gid('厨神玉玺'))).toMatchObject({
      shopCoin: 300000,
      blackDiamond: 14,
      champion: false,
    });
    expect(o.cookNums).toEqual([1, 5, 10, 15, 25, 50]);
  });

  it('目录带特色菜（名称、等级、道、食材）', () => {
    const m = t.game.world.catalog().mysterious!.find((x) => x.id === 1)!;
    expect(m).toMatchObject({
      name: '秘·仿膳饽饽',
      level: 4,
      road: 1,
      foods: [fid('海参'), fid('渤海对虾'), fid('冬笋')],
    });
  });

  it('主线「鉴定一次神秘食谱」「学会一道特色菜」', async () => {
    const ctx = await newRestaurant(t, {
      patch: { star_level: 1 },
      goods: { [GOODS.mysteryRecipe]: 1, [GOODS.krabburgerBook]: 1 },
    });
    await showQuest(t, ctx.restaurantId, 2081);
    expect(questIn(await t.game.task.tasks(ctx), 2081)).toMatchObject({ key: 'mc.appraise', done: false });
    await s().appraise(ctx, { toolId: GOODS.krabburgerBook, times: 1, noRetry: false });
    expect(questIn(await t.game.task.tasks(ctx), 2081)).toMatchObject({ done: true });
    const ctx2 = await newRestaurant(t);
    await giveRemnant(ctx2, 1, 3);
    await s().learn(ctx2, { mcId: 1 });
    await showQuest(t, ctx2.restaurantId, 2082);
    expect(questIn(await t.game.task.tasks(ctx2), 2082)).toMatchObject({
      key: 'mc.learned',
      progress: 1,
      done: true,
    });
  });

  it('区服关闭 mysterious：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, {
      patch: { star_level: 1 },
      goods: { [GOODS.mysteryRecipe]: 1, [GOODS.krabburgerBook]: 1 },
    });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { mysterious: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(s().overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(
      s().appraise(ctx, { toolId: GOODS.krabburgerBook, times: 1, noRetry: false }),
    ).rejects.toMatchObject({
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
