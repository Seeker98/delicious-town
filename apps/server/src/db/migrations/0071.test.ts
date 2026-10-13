import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { testConfig } from '../../../test/config';
import { dropRetiredGoods, RETIRED_GOODS, stripOverrides } from './0071_item_cuts';

const LAMP = gid('神灯');
const PAINTING = gid('蒙娜丽莎-名画');
const KEPT = gid('增值资本勋章');
const config = testConfig();

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0071：神灯、星愿、名画、爱心项链、使命必达和外卖加料删掉', () => {
  it('town_bless 表没了', async () => {
    const r = await sql<{ t: string | null }>`select to_regclass('town_bless')::text as t`.execute(db);
    expect(r.rows[0]!.t).toBeNull();
  });

  it('takeaway_delivery 没有 double 列了', async () => {
    const r = await sql<{ n: number }>`select count(*)::int as n from information_schema.columns
      where table_name = 'takeaway_delivery' and column_name = 'double'`.execute(db);
    expect(r.rows[0]!.n).toBe(0);
  });

  it('区服覆盖和历史版本里删掉 tuning.town.bless、tuning.friend.flip.blessedRate、集名画的三个结算设置，别的设置不动', async () => {
    const old = {
      features: { town: true },
      tuning: {
        town: { bless: { lampCoinBonus: 0.2 }, news: { pageSize: 30 } },
        friend: { flip: { blessedRate: 0.5, hitRate: 0.4 } },
        settlement: { painting13Rate: 0.2, painting13Hours: 6, autoRefuelThreshold: 1000, krabMaxGrade: 6 },
      },
    };
    const kept = {
      features: { town: true },
      tuning: {
        town: { news: { pageSize: 30 } },
        friend: { flip: { hitRate: 0.4 } },
        settlement: { krabMaxGrade: 6 },
      },
    };
    const s1 = await createShard(db);
    const s2 = await createShard(db);
    // 只有集名画的设置时也要删
    const s3 = await createShard(db);
    const onlyPainting = { tuning: { settlement: { autoRefuelThreshold: 1000 } } };
    for (const [shardId, override] of [
      [s1, old],
      [s2, kept],
      [s3, onlyPainting],
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
    await stripOverrides(db);
    for (const [shardId, want] of [
      [s1, kept],
      [s2, kept],
      [s3, { tuning: { settlement: {} } }],
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

  it('退役道具：爱心项链、名画 14 幅、神灯、使命必达', () => {
    expect(RETIRED_GOODS).toEqual([
      gid('爱心项链'),
      ...Array.from({ length: 14 }, (_, i) => 61201 + i),
      LAMP,
      gid('使命必达'),
    ]);
    for (const id of RETIRED_GOODS) expect(config.goods.get(id)?.retired, String(id)).toBe(true);
  });

  it('神灯、名画持有的、加成来源都清掉，加成缓存标脏；别的不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const until = new Date(Date.now() + 3_600_000);
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: LAMP, num: 1, expires_at: until },
        { rest_id: a, goods_id: PAINTING, num: 1, expires_at: null },
        { rest_id: b, goods_id: KEPT, num: 1, expires_at: null },
      ])
      .execute();
    await db
      .insertInto('effect_source')
      .values([
        {
          rest_id: a,
          source_type: 'honor',
          source_id: LAMP,
          effects: JSON.stringify({ magicLamp: 1 }),
          expires_at: until,
        },
        {
          rest_id: a,
          source_type: 'honor',
          source_id: PAINTING,
          effects: JSON.stringify({}),
          expires_at: null,
        },
        {
          rest_id: b,
          source_type: 'honor',
          source_id: KEPT,
          effects: JSON.stringify({ expRate: 0.1 }),
          expires_at: null,
        },
      ])
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
      .select(['rest_id', 'source_id'])
      .where('rest_id', 'in', [a, b])
      .execute();
    expect(fx).toEqual([{ rest_id: b, source_id: KEPT }]);
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

  it('没给道具时什么都不做', async () => {
    await expect(dropRetiredGoods(db, [])).resolves.toBeUndefined();
  });
});
