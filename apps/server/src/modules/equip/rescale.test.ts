import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { runSystemOp } from '../../core/op';
import { getEffectAgg } from '../effects/service';
import { syncEquipEffects } from './effects';
import { rescaleEquips } from './rescale';
import { gid } from '../../../test/items';

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
    const table = t.deps.config.requireGoods(gid('裁决之巴贝雷特的悲鸣之铲')).equip!.stressTable; // 巴贝雷特之铲
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
    const first = await rescaleEquips(t.game.deps);
    expect(first.changed).toBeGreaterThanOrEqual(1);
    const e = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(sum(e, 'base_')).toBe(table[0]);
    expect(sum(e, 'st_')).toBe(table[3]! - table[0]!);
    expect(e.st_cutting).toBe(table[1]! - table[0]!);
    expect(e.st_fire).toBe(table[2]! - table[1]!);
    expect(e.st_cook).toBe(table[3]! - table[2]!);
    expect(e.min_level).toBe(60);
    const again = await rescaleEquips(t.game.deps);
    const e2 = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(e2).toEqual(e);
    expect(again.total).toBeGreaterThanOrEqual(1);
  });
});

describe('重算的终审修复', () => {
  it('穿着的厨具重算后，缓存的厨具幸运同步更新（终审 I2）', async () => {
    const r = await newRestaurant(t);
    // 巴贝雷特之铲旧数据：幸运 35（旧 total 35），穿着；先按旧值同步一次缓存
    await oldPiece(r.restaurantId, 59, { base_luck: 35, worn: true });
    await runSystemOp(t.game.deps, r.shardId, r.restaurantId, { source: 'test' }, (op) =>
      syncEquipEffects(op),
    );
    const before = await getEffectAgg(t.db, r.restaurantId, new Date(), t.deps.config, t.deps.config.tuning);
    expect(before.luckValue).toBe(35);
    await rescaleEquips(t.game.deps);
    const after = await getEffectAgg(t.db, r.restaurantId, new Date(), t.deps.config, t.deps.config.tuning);
    expect(after.luckValue).toBe(
      t.deps.config.requireGoods(gid('裁决之巴贝雷特的悲鸣之铲')).equip!.stressTable[0],
    );
  });

  it('和玩家操作串行：这家店正被锁着改强化等级时，重算等它改完，用改完后的等级（终审 I3）', async () => {
    const r = await newRestaurant(t);
    const table = t.deps.config.requireGoods(gid('裁决之巴贝雷特的悲鸣之铲')).equip!.stressTable;
    const id = await oldPiece(r.restaurantId, 59, { base_cook: 35, stress: 3 });
    let release!: () => void;
    const held = new Promise<void>((res) => (release = res));
    let locked!: () => void;
    const isLocked = new Promise<void>((res) => (locked = res));
    const holder = t.db.transaction().execute(async (tx) => {
      await tx.selectFrom('restaurant').select('id').where('id', '=', r.restaurantId).forUpdate().execute();
      await tx.updateTable('equip').set({ stress: 4 }).where('id', '=', id).execute();
      locked();
      await held;
    });
    await isLocked;
    const run = rescaleEquips(t.game.deps);
    await new Promise((res) => setTimeout(res, 300));
    release();
    await holder;
    await run;
    const e = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(e.stress).toBe(4);
    expect(sum(e, 'st_')).toBe(table[4]! - table[0]!);
  });
});
