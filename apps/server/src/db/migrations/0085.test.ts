import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { fid } from '../../../test/items';
import { testConfig } from '../../../test/config';
import { cutFoods, FOOD_CUT } from './0085_food_cut';

const WALNUT = fid('核桃');
const WHITEFISH = fid('太湖白鱼');
const PORK = fid('五花肉');
const ANISE = fid('八角');
const config = testConfig();
const quiet = () => {};

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0085：食材减法（核桃、太湖白鱼）', () => {
  it('核桃 → 五花肉、太湖白鱼 → 八角，同级；两种都已下架、替代食材没下架', () => {
    expect(FOOD_CUT).toEqual([
      [WALNUT, PORK],
      [WHITEFISH, ANISE],
    ]);
    for (const [from, to] of FOOD_CUT) {
      expect(config.foods.get(from)?.retired).toBe(true);
      expect(config.foods.get(to)?.retired).toBeFalsy();
      expect(config.foods.get(to)!.level).toBe(config.foods.get(from)!.level);
    }
  });

  it('橱柜和冰箱：加到替代食材上，已经有的直接加；旧的行删掉；别的食材不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const other = fid('白菜');
    await db
      .insertInto('cupboard_food')
      .values([
        { rest_id: a, foods_id: WALNUT, num: 115, fridge_num: 2, fridge_unread: true },
        { rest_id: a, foods_id: PORK, num: 81, fridge_num: 1 },
        { rest_id: a, foods_id: WHITEFISH, num: 80 },
        { rest_id: b, foods_id: WHITEFISH, num: 0, fridge_num: 1 },
        { rest_id: b, foods_id: other, num: 7 },
      ])
      .execute();
    await cutFoods(db, quiet);
    const rows = await db
      .selectFrom('cupboard_food')
      .select(['rest_id', 'foods_id', 'num', 'fridge_num', 'fridge_unread'])
      .where('rest_id', 'in', [a, b])
      .orderBy('rest_id')
      .orderBy('foods_id')
      .execute();
    expect(rows).toEqual(
      [
        { rest_id: a, foods_id: PORK, num: 196, fridge_num: 3, fridge_unread: true },
        { rest_id: a, foods_id: ANISE, num: 80, fridge_num: 0, fridge_unread: false },
        { rest_id: b, foods_id: other, num: 7, fridge_num: 0, fridge_unread: false },
        { rest_id: b, foods_id: ANISE, num: 0, fridge_num: 1, fridge_unread: false },
      ].sort((x, y) => x.rest_id - y.rest_id || x.foods_id - y.foods_id),
    );
  });

  it('邮件附件里的编号换掉，别的道具、食材不动；交易所参考价删掉', async () => {
    const shard = await createShard(db);
    const items = [
      { type: 'foods', id: WALNUT, num: 3 },
      { type: 'foods', id: fid('白菜'), num: 1 },
    ];
    const mail = await db
      .insertInto('mail')
      .values({
        scope: 'shard',
        shard_id: shard,
        title: 't',
        body: 'b',
        items: JSON.stringify(items),
        source: 'admin',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('exchange_ref')
      .values([
        { shard_id: shard, foods_id: WHITEFISH, day: '2026-10-17', price: 28_080 },
        { shard_id: shard, foods_id: ANISE, day: '2026-10-17', price: 31_590 },
      ])
      .execute();
    await cutFoods(db, quiet);
    const m = await db.selectFrom('mail').select('items').where('id', '=', mail.id).executeTakeFirstOrThrow();
    expect(m.items).toEqual([
      { type: 'foods', id: PORK, num: 3 },
      { type: 'foods', id: fid('白菜'), num: 1 },
    ]);
    const refs = await db
      .selectFrom('exchange_ref')
      .select('foods_id')
      .where('shard_id', '=', shard)
      .execute();
    expect(refs.map((r) => r.foods_id)).toEqual([ANISE]);
  });

  it('交易所钱包里有要下架的食材：停下报错，不悄悄丢掉', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    await db.insertInto('exchange_wallet_food').values({ rest_id: a, foods_id: WALNUT, num: 1 }).execute();
    await expect(cutFoods(db, quiet)).rejects.toThrow(/exchange_wallet_food/);
    await db.deleteFrom('exchange_wallet_food').where('rest_id', '=', a).execute();
  });
});
