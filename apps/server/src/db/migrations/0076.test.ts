import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { testConfig } from '../../../test/config';
import { BEAST_MC, CUT_MC, EMPTY_MC, cutMysterious } from './0076_mc_cut';

const config = testConfig();
const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0076：特色菜清理', () => {
  it('删掉的 27 道配置里都没有了；剩 250 道，兽道一道不剩', () => {
    expect(EMPTY_MC).toHaveLength(10);
    expect(BEAST_MC).toHaveLength(17);
    expect(new Set(CUT_MC).size).toBe(27);
    for (const id of CUT_MC) expect(config.mysterious.has(id), String(id)).toBe(false);
    expect(config.bundle.mysteriousCookbooks).toHaveLength(250);
    expect(config.bundle.mysteriousCookbooks.some((m) => m.road === 7)).toBe(false);
  });

  it('已学、残卷、试炼对象、开的课、做过的批次（在售的置空）、守塔人的菜：删掉的菜清掉，别的菜不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const CUT = 249;
    const KEPT = 1;
    await db
      .insertInto('rest_mc')
      .values([
        { rest_id: a, mc_id: CUT, way: 1 },
        { rest_id: a, mc_id: KEPT, way: 1 },
        { rest_id: b, mc_id: 233, way: 2 },
      ])
      .execute();
    await db
      .insertInto('mc_remnant')
      .values([
        { rest_id: a, mc_id: 231, num: 2 },
        { rest_id: a, mc_id: KEPT, num: 1 },
      ])
      .execute();
    await db
      .insertInto('rest_trial')
      .values([
        { rest_id: a, mc_id: CUT, way: 1 },
        { rest_id: b, mc_id: KEPT, way: 2 },
      ])
      .execute();
    const cook = (rest: number, mc: number) => ({
      rest_id: rest,
      shard_id: shard,
      mc_id: mc,
      level: 6,
      grade: 3,
      cook_num: 1,
      total_num: 10,
      left_num: 5,
      price: 100,
    });
    const [cutCook, keptCook] = await db
      .insertInto('mc_cook')
      .values([cook(a, CUT), cook(b, KEPT)])
      .returning('id')
      .execute();
    await db.updateTable('restaurant').set({ mc_cook_id: cutCook!.id }).where('id', '=', a).execute();
    await db.updateTable('restaurant').set({ mc_cook_id: keptCook!.id }).where('id', '=', b).execute();
    await db
      .insertInto('mc_eat')
      .values([
        { cook_id: cutCook!.id, eater_rest_id: b },
        { cook_id: keptCook!.id, eater_rest_id: a },
      ])
      .execute();
    const endsAt = new Date(Date.now() + 3600_000);
    const lesson = (teacher: number, mc: number) => ({
      shard_id: shard,
      teacher_rest_id: teacher,
      mc_id: mc,
      level: 6,
      max_num: 3,
      ends_at: endsAt,
    });
    const [cutLesson, keptLesson] = await db
      .insertInto('mc_lesson')
      .values([lesson(a, 245), lesson(b, KEPT)])
      .returning('id')
      .execute();
    await db
      .insertInto('mc_lesson_student')
      .values([
        { lesson_id: cutLesson!.id, rest_id: b, type: 1, success: true },
        { lesson_id: keptLesson!.id, rest_id: a, type: 2, success: false },
      ])
      .execute();
    await db
      .insertInto('tower_watchman_mc')
      .values([
        { shard_id: shard, floor: 9, mc_id: 240, price: 300, day: '2026-10-13' },
        { shard_id: shard, floor: 10, mc_id: KEPT, price: 40, day: '2026-10-13' },
      ])
      .execute();

    await cutMysterious(db, CUT_MC, { restIds: [a, b], shardIds: [shard] });

    const rows = async (table: 'rest_mc' | 'mc_remnant' | 'rest_trial') =>
      (
        await db
          .selectFrom(table)
          .select(['rest_id', 'mc_id'])
          .where('rest_id', 'in', [a, b])
          .orderBy('rest_id')
          .orderBy('mc_id')
          .execute()
      ).map((r) => [r.rest_id, r.mc_id]);
    expect(await rows('rest_mc')).toEqual([[a, KEPT]]);
    expect(await rows('mc_remnant')).toEqual([[a, KEPT]]);
    expect(await rows('rest_trial')).toEqual([[b, KEPT]]);
    const cooks = await db.selectFrom('mc_cook').select('id').where('rest_id', 'in', [a, b]).execute();
    expect(cooks.map((c) => c.id)).toEqual([keptCook!.id]);
    const selling = await db
      .selectFrom('restaurant')
      .select(['id', 'mc_cook_id'])
      .where('id', 'in', [a, b])
      .orderBy('id')
      .execute();
    expect(selling).toEqual([
      { id: a, mc_cook_id: null },
      { id: b, mc_cook_id: keptCook!.id },
    ]);
    const eats = await db
      .selectFrom('mc_eat')
      .select('cook_id')
      .where('cook_id', 'in', [cutCook!.id, keptCook!.id])
      .execute();
    expect(eats.map((e) => e.cook_id)).toEqual([keptCook!.id]);
    const lessons = await db
      .selectFrom('mc_lesson')
      .select('id')
      .where('teacher_rest_id', 'in', [a, b])
      .execute();
    expect(lessons.map((l) => l.id)).toEqual([keptLesson!.id]);
    const students = await db
      .selectFrom('mc_lesson_student')
      .select('lesson_id')
      .where('lesson_id', 'in', [cutLesson!.id, keptLesson!.id])
      .execute();
    expect(students.map((s) => s.lesson_id)).toEqual([keptLesson!.id]);
    const watchman = await db
      .selectFrom('tower_watchman_mc')
      .select(['floor', 'mc_id'])
      .where('shard_id', '=', shard)
      .execute();
    expect(watchman).toEqual([{ floor: 10, mc_id: KEPT }]);
  });
});
