import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { dropRetired } from './0070_jobcard';

/** 退役了的两样（迁移里按编号清） */
const CULTURE = gid('嘻哈文化');
const AGAINST = gid('镇长的针对');

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0070：工作证', () => {
  it('“嘻哈文化”“镇长的针对”持有的、加成来源都清掉，加成缓存标脏；别的不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const until = new Date(Date.now() + 3_600_000);
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: CULTURE, num: 1, expires_at: until },
        { rest_id: a, goods_id: AGAINST, num: 1, expires_at: until },
        { rest_id: b, goods_id: gid('镇长的推荐'), num: 1, expires_at: until },
      ])
      .execute();
    await db
      .insertInto('effect_source')
      .values([
        {
          rest_id: a,
          source_type: 'honor',
          source_id: CULTURE,
          effects: JSON.stringify({ atRate: 0.5 }),
          expires_at: until,
        },
        {
          rest_id: b,
          source_type: 'honor',
          source_id: gid('镇长的推荐'),
          effects: JSON.stringify({ atRate: 0.3 }),
          expires_at: until,
        },
      ])
      .execute();
    await db.updateTable('restaurant').set({ effect_dirty: false }).where('id', 'in', [a, b]).execute();
    await dropRetired(db, [a, b]);
    const items = await db
      .selectFrom('store_item')
      .select(['rest_id', 'goods_id'])
      .where('rest_id', 'in', [a, b])
      .execute();
    expect(items).toEqual([{ rest_id: b, goods_id: gid('镇长的推荐') }]);
    const fx = await db
      .selectFrom('effect_source')
      .select('rest_id')
      .where('rest_id', 'in', [a, b])
      .execute();
    expect(fx).toEqual([{ rest_id: b }]);
    const dirty = await db
      .selectFrom('restaurant')
      .select(['id', 'effect_dirty'])
      .where('id', 'in', [a, b])
      .orderBy('id')
      .execute();
    expect(dirty).toEqual([
      { id: a, effect_dirty: true },
      { id: b, effect_dirty: false },
    ]);
  });

  it('每周时令值一店一周一行；镇长猜天气一店一天一次', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const week = { rest_id: a, shard_id: shard, week: '2026-10-12', gain: 5, last_at: new Date() };
    await db.insertInto('shiling_week').values(week).execute();
    await expect(db.insertInto('shiling_week').values(week).execute()).rejects.toThrow();
    const guess = { rest_id: a, shard_id: shard, day: '2026-10-12', type: 2, at: new Date() };
    await db.insertInto('mayor_guess').values(guess).execute();
    await expect(db.insertInto('mayor_guess').values(guess).execute()).rejects.toThrow();
  });
});
