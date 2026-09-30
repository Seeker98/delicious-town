import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
beforeAll(async () => {
  shard = await createShard(db);
});

const newRest = async () => createRestaurantRow(db, shard, await createAccountRow(db));
const plantRow = (restId: number, landId: number) => ({
  rest_id: restId,
  shard_id: shard,
  land_id: landId,
  seed_id: 1,
  foods_id: 101,
  stage: 1,
  stage_at: new Date(),
  infancy: 24,
  maturity: 36,
  autumn: 60,
  harvest: 1440,
  harvest_num: 20,
  harvest_max: 20,
});

describe('迁移 0010', () => {
  it('每家店的地号唯一；一块地只能种一株；阶段 1~5', async () => {
    const a = await newRest();
    const land = await db
      .insertInto('yard_land')
      .values({ rest_id: a, no: 1 })
      .returning(['id', 'level', 'exp'])
      .executeTakeFirstOrThrow();
    expect(land).toMatchObject({ level: 1, exp: 0 });
    await expect(db.insertInto('yard_land').values({ rest_id: a, no: 1 }).execute()).rejects.toThrow();
    const p = await db
      .insertInto('yard_plant')
      .values(plantRow(a, land.id))
      .returning('id')
      .executeTakeFirstOrThrow();
    const row = await db
      .selectFrom('yard_plant')
      .selectAll()
      .where('id', '=', p.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ feed_min: 0, worm: 0, grass: 0, dry: 0 });
    await expect(db.insertInto('yard_plant').values(plantRow(a, land.id)).execute()).rejects.toThrow();
    const land2 = await db
      .insertInto('yard_land')
      .values({ rest_id: a, no: 2 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await expect(
      db
        .insertInto('yard_plant')
        .values({ ...plantRow(a, land2.id), stage: 6 })
        .execute(),
    ).rejects.toThrow();
  });

  it('菜篮、配方碎片不能为负；每人每株只偷一次', async () => {
    const a = await newRest();
    const b = await newRest();
    await expect(
      db.insertInto('yard_basket').values({ rest_id: a, foods_id: 101, num: -1 }).execute(),
    ).rejects.toThrow();
    await expect(
      db.insertInto('rest_formula').values({ rest_id: a, formula_id: 1, main_num: -1 }).execute(),
    ).rejects.toThrow();
    const land = await db
      .insertInto('yard_land')
      .values({ rest_id: a, no: 1 })
      .returning('id')
      .executeTakeFirstOrThrow();
    const p = await db
      .insertInto('yard_plant')
      .values(plantRow(a, land.id))
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.insertInto('yard_steal').values({ plant_id: p.id, rest_id: b }).execute();
    await expect(
      db.insertInto('yard_steal').values({ plant_id: p.id, rest_id: b }).execute(),
    ).rejects.toThrow();
  });

  it('删作物级联偷菜记录；删店级联土地、作物、菜篮、配方', async () => {
    const a = await newRest();
    const b = await newRest();
    const land = await db
      .insertInto('yard_land')
      .values({ rest_id: a, no: 1 })
      .returning('id')
      .executeTakeFirstOrThrow();
    const p = await db
      .insertInto('yard_plant')
      .values(plantRow(a, land.id))
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.insertInto('yard_steal').values({ plant_id: p.id, rest_id: b }).execute();
    await db.deleteFrom('yard_plant').where('id', '=', p.id).execute();
    expect(await db.selectFrom('yard_steal').selectAll().where('plant_id', '=', p.id).execute()).toEqual([]);
    await db.insertInto('yard_plant').values(plantRow(a, land.id)).execute();
    await db.insertInto('yard_basket').values({ rest_id: a, foods_id: 101, num: 3 }).execute();
    await db.insertInto('rest_formula').values({ rest_id: a, formula_id: 1, sub_num: 2 }).execute();
    await db.deleteFrom('restaurant').where('id', '=', a).execute();
    for (const table of ['yard_land', 'yard_plant', 'yard_basket', 'rest_formula'] as const) {
      expect(await db.selectFrom(table).selectAll().where('rest_id', '=', a).execute()).toEqual([]);
    }
  });
});
