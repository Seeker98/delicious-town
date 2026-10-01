import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { rescaleEquips } from './rescale';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const ATTRS = ['cook', 'cutting', 'fire', 'season', 'creatives', 'luck'] as const;
const sum = (r: Record<string, unknown>, p: string) => ATTRS.reduce((s, a) => s + Number(r[`${p}${a}`]), 0);

async function oldPiece(restId: number, goodsId: number, patch: Record<string, unknown>) {
  const def = t.deps.config.requireGoods(goodsId).equip!;
  const r = await t.db
    .insertInto('equip')
    .values({
      rest_id: restId,
      goods_id: goodsId,
      part: def.part,
      suit_id: def.suitId,
      min_level: 13,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return r.id;
}
const log = (equipId: number, restId: number, stress: number, attr: string, val: number) =>
  t.db
    .insertInto('equip_stress_log')
    .values({ equip_id: equipId, rest_id: restId, stress, success: true, attr, val })
    .execute();

describe('重算已生成的厨具（设计 §6）', () => {
  it('基础按比例缩放到 +0；增量按记录重写；缺记录的等级记到主属性；穿戴等级更新；再跑不变（Review Focus 4）', async () => {
    const r = await newRestaurant(t);
    const table = t.deps.config.requireGoods(59).equip!.stressTable; // 巴贝雷特之铲
    // 旧的随机分配：厨艺 20、刀工 15（总和 35）；强化到 +3，只有 +1、+2 的记录，+2 回退后重强过一次
    const id = await oldPiece(r.restaurantId, 59, {
      base_cook: 20,
      base_cutting: 15,
      stress: 3,
      st_cook: 40,
      st_fire: 9,
    });
    await log(id, r.restaurantId, 1, 'cutting', 30);
    await log(id, r.restaurantId, 2, 'fire', 5);
    await log(id, r.restaurantId, 2, 'fire', 9);
    const first = await rescaleEquips(t.db, t.deps.config);
    expect(first.changed).toBeGreaterThanOrEqual(1);
    const e = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(sum(e, 'base_')).toBe(table[0]);
    expect(sum(e, 'st_')).toBe(table[3]! - table[0]!);
    expect(e.st_cutting).toBe(table[1]! - table[0]!);
    expect(e.st_fire).toBe(table[2]! - table[1]!);
    expect(e.st_cook).toBe(table[3]! - table[2]!);
    expect(e.min_level).toBe(60);
    const again = await rescaleEquips(t.db, t.deps.config);
    const e2 = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(e2).toEqual(e);
    expect(again.total).toBeGreaterThanOrEqual(1);
  });
});
