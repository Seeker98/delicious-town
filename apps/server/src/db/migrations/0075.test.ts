import { afterAll, describe, expect, it } from 'vitest';
import { DEVICE_TYPE, GOODS_TYPE } from '@dt/config';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { gid } from '../../../test/items';
import { testConfig } from '../../../test/config';
import { dropRetiredGoods } from './0071_item_cuts';
import { PLAQUES, RETIRED_GOODS, resyncPlacedDevices } from './0075_goods_nerf2';

const config = testConfig();
const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0075：道具减法第四批', () => {
  it('下架名单都标了退役；星级牌匾的新效果和配置里的道具效果一致', () => {
    for (const id of RETIRED_GOODS) expect(config.goods.get(id)?.retired, String(id)).toBe(true);
    expect(RETIRED_GOODS).toEqual([gid('欲望之针'), gid('探险者秘籍'), gid('巫毒娃娃')]);
    expect(Object.keys(PLAQUES)).toHaveLength(7);
    expect(PLAQUES[gid('[一星牌匾]')]).toEqual({ expRate: 0.03 });
    expect(PLAQUES[gid('[七星牌匾]')]).toEqual({ expRate: 0.3 });
    for (const [id, effects] of Object.entries(PLAQUES)) {
      const g = config.goods.get(Number(id));
      expect(g?.deviceType, id).toBe(DEVICE_TYPE.plaque);
      expect(g?.retired, id).toBeFalsy();
      expect(g?.effects, id).toEqual(effects);
    }
  });

  it('摆出的一星牌匾改成新效果并标脏；别的槽位、别的店不动；下架道具的持有和加成来源清掉', async () => {
    const shard = await createShard(db);
    const a = await createRestaurantRow(db, shard, await createAccountRow(db));
    const b = await createRestaurantRow(db, shard, await createAccountRow(db));
    const ONE = gid('[一星牌匾]');
    const other = config.bundle.goods.find(
      (g) => g.type === GOODS_TYPE.device && g.deviceType !== DEVICE_TYPE.plaque && !g.retired,
    )!;
    const NEEDLE = gid('欲望之针');
    const KEPT = gid('蟹黄堡');
    const placedAt = new Date();
    await db
      .insertInto('restaurant_device')
      .values([
        { rest_id: a, slot: 1, goods_id: ONE, placed_at: placedAt, expires_at: null },
        { rest_id: a, slot: 2, goods_id: other.id, placed_at: placedAt, expires_at: null },
        { rest_id: b, slot: 3, goods_id: other.id, placed_at: placedAt, expires_at: null },
      ])
      .execute();
    await db
      .insertInto('store_item')
      .values([
        { rest_id: a, goods_id: ONE, num: 1, expires_at: null },
        { rest_id: a, goods_id: NEEDLE, num: 1, expires_at: null },
        { rest_id: a, goods_id: KEPT, num: 3, expires_at: null },
      ])
      .execute();
    const src = (rest: number, type: string, id: number, effects: Record<string, number>) => ({
      rest_id: rest,
      source_type: type,
      source_id: id,
      effects: JSON.stringify(effects),
      expires_at: null,
    });
    await db
      .insertInto('effect_source')
      .values([
        src(a, 'device', 1, { expRate: 0.1, expValue: 1 }),
        src(a, 'device', 2, { coinValue: 4 }),
        src(a, 'honor', NEEDLE, { mysteriousRate: 0.062, exploreSuccessRate: 0.5 }),
        // b 的槽位 3 摆的不是牌匾：哪怕存的效果像牌匾也不动
        src(b, 'device', 3, { expRate: 0.15, expValue: 2 }),
      ])
      .execute();
    await db.updateTable('restaurant').set({ effect_dirty: false }).where('id', 'in', [a, b]).execute();

    await resyncPlacedDevices(db, PLAQUES, [a, b]);
    await dropRetiredGoods(db, RETIRED_GOODS, [a, b]);

    const after = await db
      .selectFrom('effect_source')
      .select(['rest_id', 'source_type', 'source_id', 'effects'])
      .where('rest_id', 'in', [a, b])
      .orderBy('rest_id')
      .orderBy('source_id')
      .execute();
    expect(after).toEqual([
      { rest_id: a, source_type: 'device', source_id: 1, effects: { expRate: 0.03 } },
      { rest_id: a, source_type: 'device', source_id: 2, effects: { coinValue: 4 } },
      { rest_id: b, source_type: 'device', source_id: 3, effects: { expRate: 0.15, expValue: 2 } },
    ]);
    const items = await db
      .selectFrom('store_item')
      .select('goods_id')
      .where('rest_id', '=', a)
      .orderBy('goods_id')
      .execute();
    expect(items.map((i) => i.goods_id)).toEqual([ONE, KEPT].sort((x, y) => x - y));
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

    // 再跑一次：效果已经是新的，不再标脏
    await db.updateTable('restaurant').set({ effect_dirty: false }).where('id', '=', a).execute();
    await resyncPlacedDevices(db, PLAQUES, [a, b]);
    const again = await db
      .selectFrom('restaurant')
      .select('effect_dirty')
      .where('id', '=', a)
      .executeTakeFirstOrThrow();
    expect(again.effect_dirty).toBe(false);
  });
});
