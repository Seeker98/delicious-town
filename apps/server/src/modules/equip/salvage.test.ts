import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { GOODS } from '@dt/config';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
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
const exists = async (id: number) =>
  (await t.db.selectFrom('equip').select('id').where('id', '=', id).executeTakeFirst()) !== undefined;

describe('分解（设计文档 §3.7）', () => {
  it('得精华 = value.essence × (强化等级 + 1)，厨具删除', async () => {
    const ctx = await newRestaurant(t);
    const id = await piece(ctx, gid('沉默之度玛的静谧之镬'), { stress: 2 });
    const r = await eq().salvage(ctx, { id });
    expect(r.data).toEqual({ essence: 36 });
    expect(await goodsNum(t, ctx.restaurantId, GOODS.essence)).toBe(36);
    expect(await exists(id)).toBe(false);
  });

  it('锁定、正在穿戴、有宝石、在预设里都不能分解或出售（设计文档 裁定 5）', async () => {
    const ctx = await newRestaurant(t);
    const locked = await piece(ctx, gid('见习之铲'), { locked: true });
    const worn = await piece(ctx, gid('见习之刀'), { worn: true });
    const gemmed = await piece(ctx, gid('见习之锅'));
    await t.db
      .insertInto('equip_gem')
      .values({
        equip_id: gemmed,
        rest_id: ctx.restaurantId,
        gem_goods_id: gid('[一阶]•蓝冥石'),
        level: 1,
        cook: 1,
      })
      .execute();
    const preset = await piece(ctx, gid('中厨之铲'));
    await t.db
      .insertInto('equip_preset')
      .values({ rest_id: ctx.restaurantId, name: 'A', part1: preset })
      .execute();
    for (const [id, reason] of [
      [locked, 'locked'],
      [worn, 'worn'],
      [gemmed, 'has_gems'],
      [preset, 'in_preset'],
    ] as const) {
      await expect(eq().salvage(ctx, { id })).rejects.toMatchObject({ params: { reason } });
      await expect(eq().sell(ctx, { id })).rejects.toMatchObject({ params: { reason } });
      expect(await exists(id)).toBe(true);
    }
  });
});

describe('出售（计划裁定 1）', () => {
  it('价格 = 道具 coin × 0.7，与强化等级无关；没有价格的不能卖', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 } });
    const id = await piece(ctx, gid('见习之铲'), { stress: 5 });
    expect((await eq().sell(ctx, { id })).data).toEqual({ coin: 42_000 });
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(42_000);
    const love = await piece(ctx, gid('真爱之铲'));
    await expect(eq().sell(ctx, { id: love })).rejects.toMatchObject({ params: { reason: 'not_sellable' } });
  });
});

describe('一键处理（设计文档 §3.11）', () => {
  it('全部干净：分解得精华合计 / 出售得银币合计', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 } });
    const a = await piece(ctx, gid('见习之铲'));
    const b = await piece(ctx, gid('沉默之度玛的静谧之镬'));
    expect((await eq().batch(ctx, { ids: [a, b], way: 'salvage' })).data).toEqual({
      count: 2,
      essence: 13,
      coin: 0,
    });
    const c = await piece(ctx, gid('见习之铲'));
    const d = await piece(ctx, gid('见习之刀'));
    expect((await eq().batch(ctx, { ids: [c, d], way: 'sell' })).data).toEqual({
      count: 2,
      essence: 0,
      coin: 84_000,
    });
    expect(await exists(a)).toBe(false);
  });

  it('有一件不干净（强化过、锁定……）整批拒绝并列出；不是我的报 NOT_FOUND', async () => {
    const ctx = await newRestaurant(t);
    const a = await piece(ctx, gid('见习之铲'));
    const b = await piece(ctx, gid('见习之铲'), { stress: 1 });
    await expect(eq().batch(ctx, { ids: [a, b], way: 'salvage' })).rejects.toMatchObject({
      params: { reason: 'batch_dirty', ids: [b] },
    });
    expect(await exists(a)).toBe(true);
    const other = await newRestaurant(t);
    await expect(eq().batch(other, { ids: [a], way: 'salvage' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('一边穿戴一边分解同一件：只有一个成功（Review Focus 2）', async () => {
    const ctx = await newRestaurant(t);
    const id = await piece(ctx, gid('见习之铲'));
    const rs = await Promise.allSettled([eq().wear(ctx, { id }), eq().salvage(ctx, { id })]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const row = await t.db.selectFrom('equip').select('worn').where('id', '=', id).executeTakeFirst();
    if (rs[0]!.status === 'fulfilled') expect(row?.worn).toBe(true);
    else expect(row).toBeUndefined();
  });
});

describe('删除厨具留流水（终审 Important 1）', () => {
  it('分解、出售、一键处理都记一条 厨具 -1', async () => {
    const ctx = await newRestaurant(t);
    const a = await piece(ctx, gid('见习之铲'));
    const b = await piece(ctx, gid('见习之刀'));
    const c = await piece(ctx, gid('见习之锅'));
    const d = await piece(ctx, gid('中厨之铲'));
    await eq().salvage(ctx, { id: a });
    await eq().sell(ctx, { id: b });
    await eq().batch(ctx, { ids: [c, d], way: 'salvage' });
    const rows = await t.db
      .selectFrom('ledger')
      .select(['item_id', 'delta', 'source'])
      .where('rest_id', '=', ctx.restaurantId)
      .where('kind', '=', 'goods')
      .where('delta', '<', 0)
      .orderBy('id')
      .execute();
    expect(rows).toEqual([
      { item_id: gid('见习之铲'), delta: -1, source: 'equip.salvage' },
      { item_id: gid('见习之刀'), delta: -1, source: 'equip.sell' },
      { item_id: gid('见习之锅'), delta: -1, source: 'equip.batch' },
      { item_id: gid('中厨之铲'), delta: -1, source: 'equip.batch' },
    ]);
  });
});
