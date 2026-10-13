import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { testConfig } from '../../../test/config';
import { dropRetiredGoods } from './0071_item_cuts';
import { RETIRED_GOODS, stripGoodsCutOverrides } from './0073_goods_cut';

const BOOK = gid('星神之书');
const APOLLO = gid('阿波罗-雕像');
const KEPT = gid('史前怪石-雕像');
const config = testConfig();

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0073：道具减法第二批', () => {
  it('restaurant 没有 cte_on 列了', async () => {
    const r = await sql<{ n: number }>`select count(*)::int as n from information_schema.columns
      where table_name = 'restaurant' and column_name = 'cte_on'`.execute(db);
    expect(r.rows[0]!.n).toBe(0);
  });

  it('区服覆盖和历史版本里删掉这些道具专用的 6 个设置，别的设置不动', async () => {
    const old = {
      features: { town: true },
      tuning: {
        settlement: { cteRate: 2, krabMaxGrade: 6 },
        growth: { driveKrabStrength: 30, drivePlanktonStrength: 80 },
        friend: { dine: { heartExpMul: 4, heartStrengthMul: 2, strengthMax: 120 } },
        mysterious: { appraiseRetryBelow: 4, thinkerStealBonus: 0.1, lessonLearnRate: 0.8 },
      },
    };
    const kept = {
      features: { town: true },
      tuning: {
        settlement: { krabMaxGrade: 6 },
        growth: { drivePlanktonStrength: 80 },
        friend: { dine: { strengthMax: 120 } },
        mysterious: { lessonLearnRate: 0.8 },
      },
    };
    const s1 = await createShard(db);
    const s2 = await createShard(db);
    // 只有一个要删的设置时也要删
    const s3 = await createShard(db);
    const onlyOne = { tuning: { friend: { dine: { heartStrengthMul: 2 } } } };
    for (const [shardId, override] of [
      [s1, old],
      [s2, kept],
      [s3, onlyOne],
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
    await stripGoodsCutOverrides(db);
    for (const [shardId, want] of [
      [s1, kept],
      [s2, kept],
      [s3, { tuning: { friend: { dine: {} } } }],
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

  it('退役道具：边牧、星神之书、煤油灯、激动的心、星光之钥、捕梦网、思想者、阿波罗、非洲复兴纪念碑、俗', () => {
    expect(RETIRED_GOODS).toEqual(
      [
        '边牧',
        '星神之书',
        '煤油灯',
        '激动的心',
        '星光之钥',
        '捕梦网',
        '思想者-雕像',
        '阿波罗-雕像',
        '非洲复兴纪念碑-雕像',
        '俗-雕像',
      ].map(gid),
    );
    for (const id of RETIRED_GOODS) expect(config.goods.get(id)?.retired, String(id)).toBe(true);
    expect(config.goods.get(KEPT)?.retired).toBeFalsy();
  });

  it('持有的、加成来源都清掉，加成缓存标脏；史前怪石不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: BOOK, num: 1, expires_at: null },
        { rest_id: a, goods_id: APOLLO, num: 1, expires_at: null },
        { rest_id: b, goods_id: KEPT, num: 1, expires_at: null },
      ])
      .execute();
    await db
      .insertInto('effect_source')
      .values([
        {
          rest_id: a,
          source_type: 'honor',
          source_id: BOOK,
          effects: JSON.stringify({ starMCBook: 1, starMCBookRate: 0.2 }),
          expires_at: null,
        },
        {
          rest_id: b,
          source_type: 'honor',
          source_id: KEPT,
          effects: JSON.stringify({}),
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
});
