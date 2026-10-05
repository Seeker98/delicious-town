import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';

const db = testDb();
afterAll(() => db.destroy());
let rest: number;
beforeAll(async () => {
  const shardId = await createShard(db);
  rest = await createRestaurantRow(db, shardId, await createAccountRow(db));
});

const piece = (part: number, worn = false) => ({
  rest_id: rest,
  goods_id: gid('见习之铲'),
  part,
  worn,
  base_cook: 3,
});

describe('迁移 0006', () => {
  it('厨具默认值；同一部位只能穿一件', async () => {
    const e = await db.insertInto('equip').values(piece(1, true)).returningAll().executeTakeFirstOrThrow();
    expect(e).toMatchObject({
      stress: 0,
      fail_streak: 0,
      locked: false,
      suit_id: 0,
      st_cook: 0,
      cur_hole: 0,
    });
    await db.insertInto('equip').values(piece(1)).execute();
    await expect(db.insertInto('equip').values(piece(1, true)).execute()).rejects.toThrow();
  });

  it('宝石和强化记录随厨具删除；预设名称同店不重复、引用的厨具删除后置空', async () => {
    const e = await db.insertInto('equip').values(piece(2)).returning('id').executeTakeFirstOrThrow();
    await db
      .insertInto('equip_gem')
      .values({ equip_id: e.id, rest_id: rest, gem_goods_id: gid('[一阶]•蓝冥石'), level: 1, cook: 1 })
      .execute();
    await db
      .insertInto('equip_stress_log')
      .values({ equip_id: e.id, rest_id: rest, stress: 1, success: true, attr: 'cutting', val: 2 })
      .execute();
    await db.insertInto('equip_preset').values({ rest_id: rest, name: '日常', part2: e.id }).execute();
    await expect(
      db.insertInto('equip_preset').values({ rest_id: rest, name: '日常' }).execute(),
    ).rejects.toThrow();
    await db.deleteFrom('equip').where('id', '=', e.id).execute();
    expect(await db.selectFrom('equip_gem').selectAll().where('equip_id', '=', e.id).execute()).toEqual([]);
    expect(
      await db.selectFrom('equip_stress_log').selectAll().where('equip_id', '=', e.id).execute(),
    ).toEqual([]);
    const p = await db
      .selectFrom('equip_preset')
      .select('part2')
      .where('rest_id', '=', rest)
      .executeTakeFirstOrThrow();
    expect(p.part2).toBeNull();
  });
});
