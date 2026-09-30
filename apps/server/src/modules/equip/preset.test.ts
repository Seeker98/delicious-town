import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RestCtx } from '../../core/deps';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const eq = () => t.game.equip;
async function piece(ctx: RestCtx, goodsId: number): Promise<number> {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({
      rest_id: ctx.restaurantId,
      goods_id: goodsId,
      part: def.part,
      suit_id: def.suitId,
      min_level: def.minLevel,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
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

describe('预设（设计文档 §3.10、裁定 11）', () => {
  it('保存当前穿戴；全部卸下后一键套用恢复；列表里标出所在预设', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 20 } });
    const a = await piece(ctx, 30);
    const b = await piece(ctx, 56);
    await eq().wear(ctx, { id: a });
    await eq().wear(ctx, { id: b });
    const saved = await eq().savePreset(ctx, { name: '日常' });
    const o = await eq().overview(ctx);
    expect(o.presets).toEqual([{ id: saved.data.id, name: '日常', parts: [a, null, b, null, null] }]);
    expect((await eq().list(ctx, {})).find((x) => x.id === a)!.inPresets).toEqual(['日常']);
    await eq().unwearAll(ctx);
    expect(await wornIds(ctx)).toEqual([]);
    const r = await eq().applyPreset(ctx, { id: saved.data.id });
    expect(r.data.skipped).toEqual([]);
    expect(await wornIds(ctx)).toEqual([a, b]);
  });

  it('套用时等级不够的部位留空并列出', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 20 } });
    const a = await piece(ctx, 30);
    const b = await piece(ctx, 56);
    await eq().wear(ctx, { id: a });
    await eq().wear(ctx, { id: b });
    const saved = await eq().savePreset(ctx, { name: 'A' });
    await t.db.updateTable('restaurant').set({ level: 5 }).where('id', '=', ctx.restaurantId).execute();
    const r = await eq().applyPreset(ctx, { id: saved.data.id });
    expect(r.data.skipped).toEqual([3]);
    expect(await wornIds(ctx)).toEqual([a]);
  });

  it('名称不能重复；最多 5 套；删除；别人的预设报 NOT_FOUND', async () => {
    const ctx = await newRestaurant(t);
    const ids: number[] = [];
    for (const name of ['1', '2', '3', '4', '5']) ids.push((await eq().savePreset(ctx, { name })).data.id);
    await expect(eq().savePreset(ctx, { name: '1' })).rejects.toMatchObject({
      params: { reason: 'preset_name' },
    });
    await expect(eq().savePreset(ctx, { name: '6' })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'presets', max: 5 },
    });
    await eq().deletePreset(ctx, { id: ids[0]! });
    expect((await eq().overview(ctx)).presets).toHaveLength(4);
    const other = await newRestaurant(t);
    await expect(eq().deletePreset(other, { id: ids[1]! })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(eq().applyPreset(other, { id: ids[1]! })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
