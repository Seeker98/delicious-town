import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { testConfig } from '../../../test/config';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { grantGoods } from '../store/grant';
import { getEffectAgg } from './service';
import { resyncHonorEffects } from './resync';

const db = testDb();
const config = testConfig();
let shardId = 0;
beforeAll(async () => {
  shardId = await createShard(db);
});
afterAll(() => db.destroy());

/** 湖南街的街道勋章 */
const HUNAN = config.bundle.streets.find((s) => s.id === 1)!.medalId;

describe('勋章加成按当前配置重写（问题记录 378 审查：调了勋章数值，老玩家存着的还是旧值）', () => {
  it('存着旧值的街道勋章改成配置里的新值，店铺标脏，加成汇总拿到新值；本来就对的不动', async () => {
    const now = new Date();
    const stale = await createRestaurantRow(db, shardId, await createAccountRow(db));
    const fresh = await createRestaurantRow(db, shardId, await createAccountRow(db));
    for (const r of [stale, fresh]) await grantGoods(db, config, r, HUNAN, 1, now);
    // 先把两家的汇总算好（不脏），再把一家的勋章改回旧值
    for (const r of [stale, fresh]) await getEffectAgg(db, r, now, config, config.tuning);
    await db
      .updateTable('effect_source')
      .set({ effects: JSON.stringify({ coinRate: 0.15, expRate: 0.15, luckValue: 10 }) })
      .where('rest_id', '=', stale)
      .where('source_id', '=', HUNAN)
      .execute();

    expect(await resyncHonorEffects(db, config, shardId)).toEqual({ sources: 1, restaurants: 1 });

    const want = config.requireGoods(HUNAN).effects;
    const row = await db
      .selectFrom('effect_source')
      .select('effects')
      .where('rest_id', '=', stale)
      .where('source_id', '=', HUNAN)
      .executeTakeFirstOrThrow();
    expect(row.effects).toEqual(want);
    const dirty = await db
      .selectFrom('restaurant')
      .select(['id', 'effect_dirty'])
      .where('id', 'in', [stale, fresh])
      .orderBy('id')
      .execute();
    expect(dirty.map((r) => r.effect_dirty)).toEqual([true, false]);
    expect((await getEffectAgg(db, stale, now, config, config.tuning)).coinRate).toBeCloseTo(
      want.coinRate ?? 0,
    );
    // 再跑一次什么都不改
    expect(await resyncHonorEffects(db, config, shardId)).toEqual({ sources: 0, restaurants: 0 });
  });

  it('别的区服的店不动', async () => {
    const other = await createShard(db);
    const r = await createRestaurantRow(db, other, await createAccountRow(db));
    await grantGoods(db, config, r, HUNAN, 1, new Date());
    await db
      .updateTable('effect_source')
      .set({ effects: JSON.stringify({ coinRate: 0.15 }) })
      .where('rest_id', '=', r)
      .execute();
    await resyncHonorEffects(db, config, shardId);
    const row = await db
      .selectFrom('effect_source')
      .select('effects')
      .where('rest_id', '=', r)
      .executeTakeFirstOrThrow();
    expect(row.effects).toEqual({ coinRate: 0.15 });
  });
});
