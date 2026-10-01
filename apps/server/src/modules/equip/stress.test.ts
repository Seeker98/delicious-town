import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { getEffectAgg } from '../effects/service';

/** 每个操作取一个新的固定序列随机数：测试里改 seq 就能控制成败 */
let seq = [0.01];
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng(seq) });
});
afterAll(() => t.close());

const eq = () => t.game.equip;
async function piece(
  ctx: RestCtx,
  goodsId: number,
  patch: Record<string, number | boolean> = {},
): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({ rest_id: ctx.restaurantId, goods_id: goodsId, part: def.part, suit_id: def.suitId, ...patch })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const row = (id: number) =>
  t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const logs = (id: number) =>
  t.db.selectFrom('equip_stress_log').selectAll().where('equip_id', '=', id).orderBy('id').execute();
const rich = () => newRestaurant(t, { patch: { coin: 1_000_000 }, goods: { 52: 50 } });

describe('强化（设计文档 §3.5）', () => {
  it('成功：扣精华和银币，等级 +1，按规则加属性，写记录', async () => {
    seq = [0.01];
    const ctx = await rich();
    const id = await piece(ctx, 30, { base_cook: 3 });
    const r = await eq().stress(ctx, { id, stone: false });
    // 见习之铲 essence 1：精华 1、银币 1 万；0.01 选中第一项厨艺，增量 max(1, ⌊0.01×4⌋) = 1
    expect(r.data).toEqual({ success: true, lucky: false, floor: false, attr: 'cook', val: 1, stress: 1 });
    expect(await row(id)).toMatchObject({ stress: 1, st_cook: 1, fail_streak: 0 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1_000_000 - 10_000);
    expect(await goodsNum(t, ctx.restaurantId, 52)).toBe(49);
    expect(await logs(id)).toMatchObject([{ stress: 1, success: true, attr: 'cook', val: 1, stone: false }]);
  });

  it('失败：照样扣费，等级不变，连续失败 +1，详情里保底 +1%；成功后清零', async () => {
    const ctx = await rich();
    const id = await piece(ctx, 30, { base_cook: 3 });
    seq = [0.99];
    const r = await eq().stress(ctx, { id, stone: false });
    expect(r.data).toMatchObject({ success: false, stress: 0 });
    expect(await row(id)).toMatchObject({ stress: 0, fail_streak: 1 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(1_000_000 - 10_000);
    const d = await eq().detail(ctx, id);
    expect(d.rate!.floor).toBeCloseTo(0.01);
    expect(d.cost).toEqual({ essence: 1, coin: 10_000 });
    seq = [0.01];
    await eq().stress(ctx, { id, stone: false });
    expect(await row(id)).toMatchObject({ stress: 1, fail_streak: 0 });
  });

  it('强化石：必定成功，增量仍按数值表（问题记录 120 起不再 +1）；没有强化石报 NOT_ENOUGH', async () => {
    const ctx = await rich();
    const id = await piece(ctx, 30, { base_cook: 8 });
    seq = [0.3];
    await expect(eq().stress(ctx, { id, stone: true })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 40 },
    });
    await t.db.insertInto('store_item').values({ rest_id: ctx.restaurantId, goods_id: 40, num: 1 }).execute();
    // 0.3 选中厨艺；见习之铲 +0→+1 增量 = 3 − 2 = 1
    const r = await eq().stress(ctx, { id, stone: true });
    expect(r.data).toMatchObject({ success: true, attr: 'cook', val: 1 });
    expect(await goodsNum(t, ctx.restaurantId, 40)).toBe(0);
  });

  it('精华或银币不够报 NOT_ENOUGH，什么都不扣', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5000 }, goods: { 52: 1 } });
    const id = await piece(ctx, 30);
    await expect(eq().stress(ctx, { id, stone: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin' },
    });
    expect(await goodsNum(t, ctx.restaurantId, 52)).toBe(1);
    const poor = await newRestaurant(t, { patch: { coin: 1_000_000 } });
    const id2 = await piece(poor, 30);
    await expect(eq().stress(poor, { id: id2, stone: false })).rejects.toMatchObject({
      params: { kind: 'goods', id: 52 },
    });
  });

  it('强化到 +8 发新闻；满级不能再强化', async () => {
    seq = [0.01];
    const ctx = await rich();
    const id = await piece(ctx, 30, { stress: 7 });
    await eq().stress(ctx, { id, stone: false });
    const news = await t.db
      .selectFrom('news')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .where('type', '=', 'equip.stress')
      .execute();
    expect(news).toHaveLength(1);
    expect(news[0]!.params).toMatchObject({ goodsId: 30, stress: 8 });
    await t.db.updateTable('equip').set({ stress: 10 }).where('id', '=', id).execute();
    await expect(eq().stress(ctx, { id, stone: false })).rejects.toMatchObject({
      params: { reason: 'max_stress' },
    });
    expect((await eq().detail(ctx, id)).rate).toBeNull();
  });

  it('穿着的厨具强化加到幸运时，加成汇总同步', async () => {
    const ctx = await rich();
    const id = await piece(ctx, 30, { base_cook: 3 });
    await eq().wear(ctx, { id });
    const before =
      (await getEffectAgg(t.db, ctx.restaurantId, new Date(), t.deps.config, t.deps.config.tuning))
        .luckValue ?? 0;
    // 成功 0.01；铲的顺序 厨艺 刀工 火候 调味 幸运：前四个 0.9 跳过，0.1 选中幸运；增量 = 见习之铲表 +0→+1 = 1
    seq = [0.01, 0.9, 0.9, 0.9, 0.9, 0.1, 0.5];
    const r = await eq().stress(ctx, { id, stone: false });
    expect(r.data).toMatchObject({ attr: 'luck', val: 1 });
    const after = await getEffectAgg(t.db, ctx.restaurantId, new Date(), t.deps.config, t.deps.config.tuning);
    expect(after.luckValue).toBe(before + 1);
  });

  it('连点两次（+9 时两个请求同时到）：只有一个成功，不会超过 +10（Review Focus 1）', async () => {
    seq = [0.01];
    const ctx = await rich();
    const id = await piece(ctx, 30, { stress: 9 });
    const rs = await Promise.allSettled([
      eq().stress(ctx, { id, stone: false }),
      eq().stress(ctx, { id, stone: false }),
    ]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rs.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { params: { reason: 'max_stress' } },
    });
    expect((await row(id)).stress).toBe(10);
    expect(await goodsNum(t, ctx.restaurantId, 52)).toBe(49);
  });
});

describe('强化回退（设计文档 §3.6、裁定 3）', () => {
  it('归元石回退 1 级扣回最近一次的增量；神秘水晶回到 +0；道具不对、没强化过都拒绝', async () => {
    seq = [0.01];
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 }, goods: { 52: 10, 225: 1, 224: 1 } });
    const id = await piece(ctx, 30, { base_cook: 3 });
    await eq().stress(ctx, { id, stone: false });
    await eq().stress(ctx, { id, stone: false });
    expect(await row(id)).toMatchObject({ stress: 2, st_cook: 2 });
    await expect(eq().rollback(ctx, { id, goodsId: 52 })).rejects.toMatchObject({
      params: { reason: 'not_back_stress' },
    });
    await eq().rollback(ctx, { id, goodsId: 225 });
    expect(await row(id)).toMatchObject({ stress: 1, st_cook: 1 });
    expect(await logs(id)).toHaveLength(1);
    expect(await goodsNum(t, ctx.restaurantId, 225)).toBe(0);
    await eq().rollback(ctx, { id, goodsId: 224 });
    expect(await row(id)).toMatchObject({ stress: 0, st_cook: 0 });
    expect(await logs(id)).toEqual([]);
    await expect(eq().rollback(ctx, { id, goodsId: 225 })).rejects.toMatchObject({
      params: { reason: 'no_stress' },
    });
  });

  it('强化记录比等级少：等级照降，属性不减成负数；回到 +0 时增量清零（Review Focus 3）', async () => {
    const ctx = await newRestaurant(t, { goods: { 225: 1, 224: 1 } });
    const id = await piece(ctx, 30, { stress: 5, st_cook: 7 });
    await eq().rollback(ctx, { id, goodsId: 225 });
    expect(await row(id)).toMatchObject({ stress: 4, st_cook: 7 });
    await eq().rollback(ctx, { id, goodsId: 224 });
    expect(await row(id)).toMatchObject({ stress: 0, st_cook: 0 });
  });
});

describe('锁定和详情', () => {
  it('锁定 / 解锁；详情带花费、持有的回退道具和宝石、强化记录', async () => {
    seq = [0.01];
    const ctx = await newRestaurant(t, { patch: { coin: 1_000_000 }, goods: { 52: 3, 225: 2, 44: 1 } });
    const id = await piece(ctx, 56, { base_fire: 12 });
    await eq().lock(ctx, { id, locked: true });
    expect((await row(id)).locked).toBe(true);
    await eq()
      .stress(ctx, { id, stone: false })
      .catch(() => undefined);
    const d = await eq().detail(ctx, id);
    expect(d.equip).toMatchObject({ id, goodsId: 56, locked: true });
    expect(d.cost).toEqual({ essence: 12, coin: 120_000 });
    expect(d.have).toEqual({ essence: 3, stone: 0, drill: 0 });
    expect(d.backItems).toEqual([{ goodsId: 225, num: 2, back: 1 }]);
    expect(d.gems).toEqual([{ goodsId: 44, num: 1, level: 1 }]);
    await eq().lock(ctx, { id, locked: false });
    expect((await row(id)).locked).toBe(false);
    await expect(eq().detail(await newRestaurant(t), id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('强化数值表（问题记录 120）', () => {
  it('成功后属性总和到表里下一档；用强化石不再多加；详情给出下一档', async () => {
    seq = [0.01];
    const ctx = await rich();
    const table = t.deps.config.requireGoods(30).equip!.stressTable;
    const id = await piece(ctx, 30, { base_cook: table[0]! });
    const d0 = await eq().detail(ctx, id);
    expect(d0.next).toEqual({ gain: table[1]! - table[0]!, total: table[1]! });
    await eq().stress(ctx, { id, stone: false });
    await t.db.insertInto('store_item').values({ rest_id: ctx.restaurantId, goods_id: 40, num: 1 }).execute();
    const r = await eq().stress(ctx, { id, stone: true });
    expect(r.data.val).toBe(table[2]! - table[1]!);
    const e = await row(id);
    const sum = (p: 'base_' | 'st_') =>
      (['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const).reduce(
        (s, a) => s + Number(e[`${p}${a}`]),
        0,
      );
    expect(sum('base_') + sum('st_')).toBe(table[2]);
  });

  it('两档相同（增量 0）也算成功，等级 +1，写记录（Review Focus 3）', async () => {
    seq = [0.01];
    const ctx = await rich();
    const def = t.deps.config.requireGoods(30).equip!;
    const table = def.stressTable as number[];
    const orig = [...table];
    table.splice(1, 1, table[0]!);
    try {
      const id = await piece(ctx, 30, { base_cook: table[0]! });
      const r = await eq().stress(ctx, { id, stone: false });
      expect(r.data).toMatchObject({ success: true, val: 0, stress: 1 });
      expect((await logs(id)).at(-1)).toMatchObject({ success: true, val: 0 });
    } finally {
      table.splice(0, table.length, ...orig);
    }
  });
});
