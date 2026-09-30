import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
let a: number;
let b: number;
beforeAll(async () => {
  shard = await createShard(db);
  a = await createRestaurantRow(db, shard, await createAccountRow(db));
  b = await createRestaurantRow(db, shard, await createAccountRow(db));
});

const cook = (rest: number) =>
  db
    .insertInto('mc_cook')
    .values({
      rest_id: rest,
      shard_id: shard,
      mc_id: 1,
      level: 4,
      grade: 3,
      cook_num: 1,
      total_num: 400,
      left_num: 400,
      price: 40,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

describe('迁移 0008', () => {
  it('rest_mc 默认值；残卷不能为负；同店同菜唯一', async () => {
    await db.insertInto('rest_mc').values({ rest_id: a, mc_id: 1, way: 1 }).execute();
    const r = await db.selectFrom('rest_mc').selectAll().where('rest_id', '=', a).executeTakeFirstOrThrow();
    expect(r).toMatchObject({ curlevel: 1, curexp: 0, trial_worth: 0, trial_exp: 0, master_rest_id: null });
    await expect(
      db.insertInto('rest_mc').values({ rest_id: a, mc_id: 1, way: 1 }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('mc_remnant').values({ rest_id: a, mc_id: 1, num: -1 }).execute(),
    ).rejects.toThrow();
  });

  it('mc_cook：剩余不能为负；餐厅指针删行后置空；品尝同批同人唯一', async () => {
    const c = await cook(a);
    await db.updateTable('restaurant').set({ mc_cook_id: c.id }).where('id', '=', a).execute();
    await expect(
      db.updateTable('mc_cook').set({ left_num: -1 }).where('id', '=', c.id).execute(),
    ).rejects.toThrow();
    await db.insertInto('mc_eat').values({ cook_id: c.id, eater_rest_id: b }).execute();
    await expect(
      db.insertInto('mc_eat').values({ cook_id: c.id, eater_rest_id: b }).execute(),
    ).rejects.toThrow();
    await db.deleteFrom('mc_cook').where('id', '=', c.id).execute();
    const r = await db
      .selectFrom('restaurant')
      .select('mc_cook_id')
      .where('id', '=', a)
      .executeTakeFirstOrThrow();
    expect(r.mc_cook_id).toBeNull();
    expect(await db.selectFrom('mc_eat').selectAll().where('cook_id', '=', c.id).execute()).toEqual([]);
  });

  it('每位老师只能有一门未关闭的课；关闭后可以再开；删老师级联删课和学生', async () => {
    const t = await createRestaurantRow(db, shard, await createAccountRow(db));
    const lesson = (closed: Date | null) =>
      db
        .insertInto('mc_lesson')
        .values({
          shard_id: shard,
          teacher_rest_id: t,
          mc_id: 1,
          level: 4,
          max_num: 5,
          ends_at: new Date(Date.now() + 3600_000),
          closed_at: closed,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const l1 = await lesson(null);
    await expect(lesson(null)).rejects.toThrow();
    await db.updateTable('mc_lesson').set({ closed_at: new Date() }).where('id', '=', l1.id).execute();
    const l2 = await lesson(null);
    await db
      .insertInto('mc_lesson_student')
      .values({ lesson_id: l2.id, rest_id: b, type: 1, success: true })
      .execute();
    await expect(
      db
        .insertInto('mc_lesson_student')
        .values({ lesson_id: l2.id, rest_id: b, type: 2, success: false })
        .execute(),
    ).rejects.toThrow();
    await db.deleteFrom('restaurant').where('id', '=', t).execute();
    expect(await db.selectFrom('mc_lesson').selectAll().where('teacher_rest_id', '=', t).execute()).toEqual(
      [],
    );
    expect(
      await db.selectFrom('mc_lesson_student').selectAll().where('lesson_id', '=', l2.id).execute(),
    ).toEqual([]);
  });
});
