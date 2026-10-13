import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { testConfig } from '../../../test/config';
import { dropRetiredGoods } from './0071_item_cuts';
import { applyNerfs, NERFED, RETIRED_GOODS, stripCollectionOverrides } from './0074_goods_nerf';

const config = testConfig();
const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0074：道具减法第三批', () => {
  it('区服覆盖和历史版本里删掉三块纪念牌匾的收集加成设置，别的设置不动', async () => {
    const old = {
      tuning: {
        collection: { plaquePer: 0.02, an2023Multiplier: 3, mdcgMultiplier: 2, an2025CoinBonus: 0.2 },
      },
    };
    const kept = { tuning: { collection: { plaquePer: 0.02 } } };
    const shard = await createShard(db);
    await db
      .insertInto('shard_config')
      .values({ shard_id: shard, override: JSON.stringify(old) })
      .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override: JSON.stringify(old) }))
      .execute();
    await db
      .insertInto('shard_config_history')
      .values({ shard_id: shard, version: 1, override: JSON.stringify(old), note: 'x' })
      .execute();
    await stripCollectionOverrides(db);
    const cur = await db
      .selectFrom('shard_config')
      .select('override')
      .where('shard_id', '=', shard)
      .executeTakeFirstOrThrow();
    expect(cur.override).toEqual(kept);
    const hist = await db
      .selectFrom('shard_config_history')
      .select('override')
      .where('shard_id', '=', shard)
      .execute();
    expect(hist.map((h) => h.override)).toEqual([kept]);
  });

  it('退役名单都标了退役；削弱后的效果和配置里的道具效果一致', () => {
    for (const id of RETIRED_GOODS) expect(config.goods.get(id)?.retired, String(id)).toBe(true);
    expect(RETIRED_GOODS).toContain(gid('[2023纪念牌匾]'));
    expect(RETIRED_GOODS).toContain(gid('财神降临'));
    for (const [id, effects] of Object.entries(NERFED)) {
      const g = config.goods.get(Number(id));
      expect(g?.retired, id).toBeFalsy();
      expect(g?.effects, id).toEqual(effects);
    }
  });

  it('已经生效的加成来源改成新效果并标脏；别的加成来源不动；退役的持有和加成来源清掉', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const CHEF = gid('厨神');
    const PLAQUE = gid('[马到成功]');
    const KEPT = gid('痛心入骨');
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: CHEF, num: 1, expires_at: null },
        { rest_id: a, goods_id: PLAQUE, num: 1, expires_at: null },
      ])
      .execute();
    await db
      .insertInto('effect_source')
      .values([
        {
          rest_id: a,
          source_type: 'honor',
          source_id: CHEF,
          effects: JSON.stringify({ expRate: 0.25, coinValue: 2 }),
          expires_at: null,
        },
        {
          rest_id: b,
          source_type: 'equip',
          source_id: CHEF,
          effects: JSON.stringify({ coinValue: 9 }),
          expires_at: null,
        },
      ])
      .execute();
    await db.updateTable('restaurant').set({ effect_dirty: false }).where('id', 'in', [a, b]).execute();
    await applyNerfs(db, [a, b]);
    await dropRetiredGoods(db, RETIRED_GOODS, [a, b]);
    const src = await db
      .selectFrom('effect_source')
      .select(['rest_id', 'source_type', 'effects'])
      .where('rest_id', 'in', [a, b])
      .orderBy('rest_id')
      .execute();
    expect(src).toEqual([
      { rest_id: a, source_type: 'honor', effects: { coinRate: 0.03, expRate: 0.03 } },
      { rest_id: b, source_type: 'equip', effects: { coinValue: 9 } },
    ]);
    const items = await db.selectFrom('store_item').select('goods_id').where('rest_id', '=', a).execute();
    expect(items.map((i) => i.goods_id)).toEqual([CHEF]);
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
    expect(NERFED[KEPT]).toBeDefined();
  });
});
