import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import type { RestCtx } from '../../core/deps';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

let seq = [0.5];
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
    .values({
      rest_id: ctx.restaurantId,
      goods_id: goodsId,
      part: def.part,
      suit_id: def.suitId,
      cur_hole: def.hole,
      max_hole: def.maxHole,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const gemsOn = (id: number) => t.db.selectFrom('equip_gem').selectAll().where('equip_id', '=', id).execute();
async function setWeather(shardId: number, weatherId: number) {
  await t.game.world.ensure(shardId);
  await t.db
    .updateTable('world_state')
    .set({ weather_id: weatherId })
    .where('shard_id', '=', shardId)
    .execute();
}

describe('打孔（设计文档 §3.8）', () => {
  it('消耗打孔石，孔位 +1，到上限后不能再打；不能打孔的厨具、没有打孔石都拒绝', async () => {
    const ctx = await newRestaurant(t, { goods: { [GOODS.drillStone]: 5 } });
    const id = await piece(ctx, gid('沉默之度玛的静谧之镬'), { cur_hole: 2 });
    expect((await eq().drill(ctx, { id })).data).toEqual({ curHole: 3 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.drillStone)).toBe(4);
    await expect(eq().drill(ctx, { id })).rejects.toMatchObject({ params: { reason: 'hole_full' } });
    const plain = await piece(ctx, gid('见习之铲'));
    await expect(eq().drill(ctx, { id: plain })).rejects.toMatchObject({
      params: { reason: 'cannot_drill' },
    });
    const poor = await newRestaurant(t);
    const p2 = await piece(poor, gid('沉默之度玛的静谧之镬'));
    await expect(eq().drill(poor, { id: p2 })).rejects.toMatchObject({
      params: { kind: 'goods', id: GOODS.drillStone },
    });
  });
});

describe('镶嵌和摘除（设计文档 §3.8、裁定 6）', () => {
  it('镶嵌：扣宝石和体力（= 阶数），属性加到厨具上；孔满了、不是宝石都拒绝', async () => {
    const ctx = await newRestaurant(t, {
      patch: { strength: 10 },
      goods: { [gid('[一阶]•蓝冥石')]: 2, [GOODS.essence]: 1 },
    });
    const id = await piece(ctx, gid('沉默之度玛的静谧之镬'));
    await eq().inlay(ctx, { id, gemId: 44 });
    expect(await gemsOn(id)).toMatchObject([{ gem_goods_id: gid('[一阶]•蓝冥石'), level: 1, cook: 1 }]);
    expect((await restRow(t, ctx.restaurantId)).strength).toBe(9);
    expect(await goodsNum(t, ctx.restaurantId, gid('[一阶]•蓝冥石'))).toBe(1);
    const o = await eq().list(ctx, {});
    expect(o[0]!.gem.cook).toBe(1);
    await expect(eq().inlay(ctx, { id, gemId: 44 })).rejects.toMatchObject({ params: { reason: 'no_hole' } });
    await t.db.updateTable('equip').set({ cur_hole: 2 }).where('id', '=', id).execute();
    await expect(eq().inlay(ctx, { id, gemId: 52 })).rejects.toMatchObject({ params: { reason: 'not_gem' } });
  });

  it('摘除：2 星以下免费；2 星起花 阶数 × 1 万；酸雨免费；宝石退回仓库', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 2, coin: 25_000 } });
    const id = await piece(ctx, gid('沉默之度玛的静谧之镬'), { cur_hole: 3 });
    const row = (gid: number, level: number) =>
      t.db
        .insertInto('equip_gem')
        .values({ equip_id: id, rest_id: ctx.restaurantId, gem_goods_id: gid, level })
        .returning('id')
        .executeTakeFirstOrThrow();
    const g1 = await row(274, 2);
    expect((await eq().ungem(ctx, { gemRowId: g1.id })).data).toEqual({ coin: 20_000 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(5_000);
    expect(await goodsNum(t, ctx.restaurantId, gid('[二阶]•智慧石'))).toBe(1);
    const g2 = await row(274, 2);
    await setWeather(ctx.shardId, 18);
    expect((await eq().ungem(ctx, { gemRowId: g2.id })).data).toEqual({ coin: 0 });
  });

  it('银币不够时拒绝，宝石还在厨具上（Review Focus 5）', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 3, coin: 100 } });
    const id = await piece(ctx, gid('沉默之度玛的静谧之镬'));
    const g = await t.db
      .insertInto('equip_gem')
      .values({ equip_id: id, rest_id: ctx.restaurantId, gem_goods_id: gid('[一阶]•蓝冥石'), level: 1 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await expect(eq().ungem(ctx, { gemRowId: g.id })).rejects.toMatchObject({ params: { kind: 'coin' } });
    expect(await gemsOn(id)).toHaveLength(1);
    expect(await goodsNum(t, ctx.restaurantId, gid('[一阶]•蓝冥石'))).toBe(0);
    await expect(eq().ungem(await newRestaurant(t), { gemRowId: g.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('宝石升阶（设计文档 §3.9）', () => {
  it('每组独立：成功 / 幸运补救 / 失败；扣 2×组数 颗和 组数×阶数 体力；失败给经验', async () => {
    // 1 阶成功率 0.77；幸运 100 → 幸运率约 0.17
    seq = [0.5, 0.9, 0.0, 0.9, 0.9];
    const ctx = await newRestaurant(t, {
      patch: { strength: 10, luck: 100 },
      goods: { [gid('[一阶]•蓝冥石')]: 7 },
    });
    const r = await eq().gemLevelUp(ctx, { goodsId: gid('[一阶]•蓝冥石'), num: 3 });
    expect(r.data).toEqual({ success: 2, lucky: 1, fail: 1, exp: 1000 });
    expect(await goodsNum(t, ctx.restaurantId, gid('[一阶]•蓝冥石'))).toBe(1);
    expect(await goodsNum(t, ctx.restaurantId, gid('[二阶]•蓝冥石'))).toBe(2);
    const rest = await restRow(t, ctx.restaurantId);
    expect(rest.strength).toBe(7);
  });

  it('最高阶、宝石不够、体力不够都拒绝', async () => {
    const ctx = await newRestaurant(t, {
      patch: { strength: 1 },
      goods: { [gid('[六阶]•智慧石')]: 2, [gid('[一阶]•蓝冥石')]: 3 },
    });
    await expect(eq().gemLevelUp(ctx, { goodsId: gid('[六阶]•智慧石'), num: 1 })).rejects.toMatchObject({
      params: { reason: 'gem_max' },
    });
    await expect(eq().gemLevelUp(ctx, { goodsId: gid('[一阶]•蓝冥石'), num: 2 })).rejects.toMatchObject({
      params: { kind: 'goods', id: gid('[一阶]•蓝冥石') },
    });
    await t.db.updateTable('restaurant').set({ strength: 0 }).where('id', '=', ctx.restaurantId).execute();
    await expect(eq().gemLevelUp(ctx, { goodsId: gid('[一阶]•蓝冥石'), num: 1 })).rejects.toMatchObject({
      params: { kind: 'strength' },
    });
  });

  it('升到 4 阶以上发新闻；5 阶以上失败发破碎新闻', async () => {
    const ctx = await newRestaurant(t, {
      patch: { strength: 100, luck: 0 },
      goods: { [gid('[四阶]•智慧石')]: 4 },
    });
    seq = [0.0];
    await eq().gemLevelUp(ctx, { goodsId: gid('[四阶]•智慧石'), num: 1 });
    seq = [0.99];
    await eq().gemLevelUp(ctx, { goodsId: gid('[四阶]•智慧石'), num: 1 });
    const types = (
      await t.db
        .selectFrom('news')
        .select('type')
        .where('rest_id', '=', ctx.restaurantId)
        .orderBy('id')
        .execute()
    ).map((n) => n.type);
    expect(types).toEqual(['gem.levelUp', 'gem.broken']);
  });

  it('宝石列表：持有数、下一阶、成功率（不含幸运）', async () => {
    const ctx = await newRestaurant(t, { goods: { [gid('[一阶]•蓝冥石')]: 3, [gid('[六阶]•智慧石')]: 1 } });
    const g = await eq().gems(ctx);
    expect(g.items.find((x) => x.goodsId === gid('[一阶]•蓝冥石'))).toMatchObject({
      num: 3,
      level: 1,
      nextId: 286,
    });
    expect(g.items.find((x) => x.goodsId === gid('[一阶]•蓝冥石'))!.rate).toBeCloseTo(0.77);
    expect(g.items.find((x) => x.goodsId === gid('[六阶]•智慧石'))).toMatchObject({ nextId: null });
  });
});

describe('宝石排序（问题记录 132）', () => {
  // 41 智慧一阶、43 黄玉一阶、44 蓝冥一阶、275 智慧三阶、286 蓝冥二阶、344 蓝冥六阶（数据里等级写的 5）、289 蓝冥五阶
  const goods = { 41: 1, 43: 1, 44: 1, 275: 1, 286: 1, 289: 1, 344: 1 };
  const ORDER = [
    gid('[一阶]•蓝冥石'),
    gid('[二阶]•蓝冥石'),
    gid('[五阶]•蓝冥石'),
    gid('[六阶]•蓝冥石'),
    gid('[一阶]•黄玉石'),
    gid('[一阶]•智慧石'),
    gid('[三阶]•智慧石'),
  ];

  it('宝石页：按属性（厨艺、刀工、火候、调味、创意）分组，组内按加成从低到高', async () => {
    const ctx = await newRestaurant(t, { goods });
    expect((await eq().gems(ctx)).items.map((x) => x.goodsId)).toEqual(ORDER);
  });

  it('厨具详情的镶嵌下拉框同样排序', async () => {
    const ctx = await newRestaurant(t, { goods });
    const id = await piece(ctx, gid('裁决之巴贝雷特的悲鸣之铲'));
    expect((await eq().detail(ctx, id)).gems.map((x) => x.goodsId)).toEqual(ORDER);
  });
});

describe('详情里的摘除单价（问题记录 128：要花钱的摘除才确认）', () => {
  it('2 星以下、酸雨天免费时单价是 0；否则是阶数单价', async () => {
    const poor = await newRestaurant(t, { patch: { star_level: 1 } });
    expect((await eq().detail(poor, await piece(poor, gid('沉默之度玛的静谧之镬')))).ungemCoinPerLevel).toBe(
      0,
    );
    const rich = await newRestaurant(t, { shardId: await createShard(t.db), patch: { star_level: 2 } });
    const id = await piece(rich, gid('沉默之度玛的静谧之镬'));
    expect((await eq().detail(rich, id)).ungemCoinPerLevel).toBe(10_000);
    await setWeather(rich.shardId, 18);
    expect((await eq().detail(rich, id)).ungemCoinPerLevel).toBe(0);
  });
});
