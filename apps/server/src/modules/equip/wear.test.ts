import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { getEffectAgg } from '../effects/service';
import { settleShardRound } from '../settlement/runner';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const eq = () => t.game.equip;
/** 直接写一件厨具（属性可指定），返回 id */
async function piece(ctx: RestCtx, goodsId: number, patch: Record<string, number> = {}): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({
      rest_id: ctx.restaurantId,
      goods_id: goodsId,
      part: def.part,
      suit_id: def.suitId,
      min_level: def.minLevel,
      cur_hole: def.hole,
      max_hole: def.maxHole,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const agg = (ctx: RestCtx) =>
  getEffectAgg(t.db, ctx.restaurantId, new Date(), t.deps.config, {
    tuning: t.deps.config.tuning,
    features: {},
  });
const wornIds = async (ctx: RestCtx) =>
  (
    await t.db
      .selectFrom('equip')
      .select('id')
      .where('rest_id', '=', ctx.restaurantId)
      .where('worn', '=', true)
      .orderBy('id')
      .execute()
  ).map((r) => r.id);

describe('穿戴（设计文档 §3.10）', () => {
  it('等级不够不能穿；同部位已有的自动换下', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 1 } });
    const a = await piece(ctx, gid('沉默之度玛的静谧之镬'));
    await expect(eq().wear(ctx, { id: a })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'level', need: 65 },
    });
    await t.db.updateTable('restaurant').set({ level: 70 }).where('id', '=', ctx.restaurantId).execute();
    await eq().wear(ctx, { id: a });
    const b = await piece(ctx, gid('沉默之度玛的静谧之镬'));
    await eq().wear(ctx, { id: b });
    expect(await wornIds(ctx)).toEqual([b]);
  });

  it('卸下、全部卸下；卸下没穿的报 not_worn；别人的厨具报 NOT_FOUND', async () => {
    const ctx = await newRestaurant(t);
    const [a, b] = [await piece(ctx, gid('见习之铲')), await piece(ctx, gid('见习之刀'))];
    await eq().wear(ctx, { id: a });
    await eq().wear(ctx, { id: b });
    await eq().unwear(ctx, { id: a });
    expect(await wornIds(ctx)).toEqual([b]);
    await expect(eq().unwear(ctx, { id: a })).rejects.toMatchObject({ params: { reason: 'not_worn' } });
    await eq().unwearAll(ctx);
    expect(await wornIds(ctx)).toEqual([]);
    const other = await newRestaurant(t);
    await expect(eq().wear(other, { id: a })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('穿上后厨具幸运进加成汇总，卸下后去掉', async () => {
    const ctx = await newRestaurant(t);
    const before = (await agg(ctx)).luckValue ?? 0;
    const a = await piece(ctx, gid('见习之铲'), { base_luck: 5, st_luck: 2 });
    await eq().wear(ctx, { id: a });
    expect((await agg(ctx)).luckValue).toBe(before + 7);
    await eq().unwear(ctx, { id: a });
    expect((await agg(ctx)).luckValue ?? 0).toBe(before);
  });

  it('厨具属性按权重进收益加成（问题记录 411）：银币 0.04%、经验 0.025%、特色菜金牌 0.03% 每点，幸运不算', async () => {
    const ctx = await newRestaurant(t);
    const before = await agg(ctx);
    // 加权点数 = 厨艺 10 × 1 + 刀工 4 × 0.95 + 创意 5 × 1.4 = 20.8
    const a = await piece(ctx, gid('见习之铲'), {
      base_cook: 10,
      st_cutting: 4,
      base_creatives: 5,
      base_luck: 3,
    });
    await eq().wear(ctx, { id: a });
    const after = await agg(ctx);
    expect((after.coinRate ?? 0) - (before.coinRate ?? 0)).toBeCloseTo(20.8 * 0.0004, 9);
    expect((after.expRate ?? 0) - (before.expRate ?? 0)).toBeCloseTo(20.8 * 0.00025, 9);
    expect((after.mcGoldRate ?? 0) - (before.mcGoldRate ?? 0)).toBeCloseTo(20.8 * 0.0003, 9);
    await eq().unwear(ctx, { id: a });
    expect((await agg(ctx)).coinRate ?? 0).toBeCloseTo(before.coinRate ?? 0, 9);
  });

  it('真爱套装：3 件上座 +5%、挑剔 +3%；5 件再加最终银币 +5%、幸运 +52', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13 } });
    const base = await agg(ctx);
    for (const g of ['真爱之铲', '真爱之刀', '真爱之锅'].map(gid))
      await eq().wear(ctx, { id: await piece(ctx, g) });
    const three = await agg(ctx);
    expect((three.atRate ?? 0) - (base.atRate ?? 0)).toBeCloseTo(0.05);
    expect((three.spRate ?? 0) - (base.spRate ?? 0)).toBeCloseTo(0.03);
    for (const g of ['真爱之瓶', '真爱之帽'].map(gid)) await eq().wear(ctx, { id: await piece(ctx, g) });
    const five = await agg(ctx);
    expect((five.coinRate ?? 0) - (base.coinRate ?? 0)).toBeCloseTo(0.05);
    expect((five.luckValue ?? 0) - (base.luckValue ?? 0)).toBe(52);
  });

  it('结算用上厨具幸运', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { oil: 1000 } });
    await eq().wear(ctx, { id: await piece(ctx, gid('见习之铲'), { base_luck: 30 }) });
    await settleShardRound(t.game.deps, t.game.world, shardId, roundOf(new Date()), new Date());
    const row = await t.db
      .selectFrom('income_round')
      .select('rates')
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const rates = row.rates as { luck: { parts: Record<string, number> } };
    expect(rates.luck.parts.effects).toBe(30);
  });

  it('概览：5 个部位、套装状态、属性（加点 + 厨具）和厨力', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 13, attr_cook: 4, luck: 10 } });
    await eq().wear(ctx, { id: await piece(ctx, gid('见习之铲'), { base_cook: 3, st_cook: 2 }) });
    await t.db
      .insertInto('effect_source')
      .values({
        rest_id: ctx.restaurantId,
        source_type: 'device',
        source_id: 1,
        effects: JSON.stringify({ luckValue: 20 }),
      })
      .execute();
    const o = await eq().overview(ctx);
    expect(o.worn.map((w) => w?.goodsId ?? null)).toEqual([gid('见习之铲'), null, null, null, null]);
    expect(o.worn[0]).toMatchObject({ stress: 0, base: { cook: 3 }, boost: { cook: 2 }, total: { cook: 5 } });
    expect(o.attrs.gear.cook).toBe(5);
    expect(o.attrs.total.cook).toBe(9);
    expect(o.attrs.power).toBe(9 + 5);
    expect(o.suits).toEqual([]);
    // 厨具收益加成（问题记录 411）：厨艺 5 × 1
    expect(o.income).toEqual({ coinRate: 0.002, expRate: 0.00125, mcGoldRate: 0.0015 });
    // 赛厨时的厨力（问题记录 417）：幸运算上所有加成（这里另有设施幸运 +20），和厨塔页显示的一样
    expect(o.duelPower).toEqual({ attack: 9 + 15, defend: 9 + 15 });
    expect(o.count).toBe(1);
    const list = await eq().list(ctx, { part: 1 });
    expect(list.map((x) => x.goodsId)).toEqual([gid('见习之铲')]);
    expect(await eq().list(ctx, { part: 2 })).toEqual([]);
  });

  it('功能关闭时读写接口都返回 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { equip: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const ctx = await newRestaurant(t, { shardId });
    await expect(eq().overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(eq().unwearAll(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});
