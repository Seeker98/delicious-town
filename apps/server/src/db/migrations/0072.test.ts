import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { testConfig } from '../../../test/config';
import { dropRetiredGoods } from './0071_item_cuts';
import { RETIRED_GOODS, stripYardOverrides, YARD_TABLES } from './0072_yard_cut';

const FERTILIZER = gid('低级肥料');
const MOON = gid('星月密卷');
const KEPT = gid('仙贝-红');
const config = testConfig();

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0072：菜园整个删掉', () => {
  it('种子、菜地、作物、偷菜记录、菜篮、配方六张表都没了', async () => {
    expect(YARD_TABLES).toHaveLength(6);
    for (const t of YARD_TABLES) {
      const r = await sql<{ t: string | null }>`select to_regclass(${t})::text as t`.execute(db);
      expect(r.rows[0]!.t, t).toBeNull();
    }
  });

  it('区服覆盖和历史版本里删掉 features.yard、tuning.yard、tuning.shiling.seedRate，别的设置不动', async () => {
    const old = {
      features: { yard: false, town: true },
      tuning: {
        yard: { maxLands: 9 },
        shiling: { seedRate: 5, weekCap: 100 },
        town: { news: { pageSize: 30 } },
      },
    };
    const kept = {
      features: { town: true },
      tuning: { shiling: { weekCap: 100 }, town: { news: { pageSize: 30 } } },
    };
    const s1 = await createShard(db);
    const s2 = await createShard(db);
    // 只有 features.yard 时也要删
    const s3 = await createShard(db);
    const onlyYard = { features: { yard: false } };
    for (const [shardId, override] of [
      [s1, old],
      [s2, kept],
      [s3, onlyYard],
    ] as const) {
      await db
        .insertInto('shard_config')
        .values({ shard_id: shardId, override: JSON.stringify(override) })
        .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override: JSON.stringify(override) }))
        .execute();
      await db
        .insertInto('shard_config_history')
        .values({ shard_id: shardId, version: 1, override: JSON.stringify(override), note: 'x' })
        .execute();
    }
    await stripYardOverrides(db);
    for (const [shardId, want] of [
      [s1, kept],
      [s2, kept],
      [s3, { features: {} }],
    ] as const) {
      const cur = await db
        .selectFrom('shard_config')
        .select('override')
        .where('shard_id', '=', shardId)
        .executeTakeFirstOrThrow();
      expect(cur.override).toEqual(want);
      const hist = await db
        .selectFrom('shard_config_history')
        .select('override')
        .where('shard_id', '=', shardId)
        .execute();
      expect(hist.map((h) => h.override)).toEqual([want]);
    }
  });

  it('退役道具：低级肥料、高级肥料、玄奥配方、配方精华、星月密卷', () => {
    expect(RETIRED_GOODS).toEqual([FERTILIZER, gid('高级肥料'), gid('玄奥配方'), gid('配方精华'), MOON]);
    for (const id of RETIRED_GOODS) expect(config.goods.get(id)?.retired, String(id)).toBe(true);
    expect(config.goods.get(KEPT)?.retired).toBeFalsy();
  });

  it('肥料、星月密卷持有的、加成来源都清掉，加成缓存标脏；仙贝不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: FERTILIZER, num: 3, expires_at: null },
        { rest_id: a, goods_id: MOON, num: 1, expires_at: null },
        { rest_id: b, goods_id: KEPT, num: 2, expires_at: null },
      ])
      .execute();
    await db
      .insertInto('effect_source')
      .values({
        rest_id: a,
        source_type: 'honor',
        source_id: MOON,
        effects: JSON.stringify({ smBook: 1 }),
        expires_at: null,
      })
      .execute();
    await db.updateTable('restaurant').set({ effect_dirty: false }).where('id', 'in', [a, b]).execute();
    await dropRetiredGoods(db, RETIRED_GOODS, [a, b]);
    const items = await db
      .selectFrom('store_item')
      .select(['rest_id', 'goods_id'])
      .where('rest_id', 'in', [a, b])
      .execute();
    expect(items).toEqual([{ rest_id: b, goods_id: KEPT }]);
    const fx = await db
      .selectFrom('effect_source')
      .select('rest_id')
      .where('rest_id', 'in', [a, b])
      .execute();
    expect(fx).toEqual([]);
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
});
