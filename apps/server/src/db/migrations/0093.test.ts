import { afterAll, describe, expect, it } from 'vitest';
import { GOODS_TYPE } from '@dt/config';
import { testDb } from '../../../test/db';
import { testConfig } from '../../../test/config';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { dropRetiredGoods } from './0071_item_cuts';
import { RETIRED_GOODS } from './0093_retire_sandy';

const config = testConfig();
const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0093：珊迪、派大星、海绵宝宝下架', () => {
  it('三个都标了退役，配置里没有地方再发它们', () => {
    expect(RETIRED_GOODS).toEqual([gid('珊迪'), gid('派大星'), gid('海绵宝宝')]);
    for (const id of RETIRED_GOODS) expect(config.goods.get(id)?.retired, String(id)).toBe(true);
    expect(JSON.stringify(config.tuning)).not.toMatch(/6050[678]/);
  });

  it('持有的和正在生效的加成清掉、加成缓存标脏；别的勋章不动', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const kept = config.bundle.goods.find(
      (g) => g.type === GOODS_TYPE.honor && !g.retired && !RETIRED_GOODS.includes(g.id),
    )!;
    const until = new Date(Date.now() + 3600_000);
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: gid('珊迪'), num: 1, acquired_at: new Date(), expires_at: until },
        { rest_id: a, goods_id: kept.id, num: 1, acquired_at: new Date(), expires_at: until },
      ])
      .execute();
    await db
      .insertInto('effect_source')
      .values([
        {
          rest_id: a,
          source_type: 'honor',
          source_id: gid('珊迪'),
          effects: JSON.stringify({ coinRate: 0.15 }),
          expires_at: until,
        },
        {
          rest_id: a,
          source_type: 'honor',
          source_id: kept.id,
          effects: JSON.stringify({ expRate: 0.1 }),
          expires_at: until,
        },
      ])
      .execute();
    await db.updateTable('restaurant').set({ effect_dirty: false }).where('id', '=', a).execute();
    await dropRetiredGoods(db, RETIRED_GOODS, [a]);
    const items = await db.selectFrom('store_item').select('goods_id').where('rest_id', '=', a).execute();
    expect(items.map((x) => x.goods_id)).toEqual([kept.id]);
    const fx = await db.selectFrom('effect_source').select('source_id').where('rest_id', '=', a).execute();
    expect(fx.map((x) => x.source_id)).toEqual([kept.id]);
    const r = await db
      .selectFrom('restaurant')
      .select('effect_dirty')
      .where('id', '=', a)
      .executeTakeFirstOrThrow();
    expect(r.effect_dirty).toBe(true);
  });
});
