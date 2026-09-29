import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { getEffectAgg, listActiveEffects, removeEffectSource, upsertEffectSource } from './service';

const db = testDb();
let shardId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
});
const newRest = async () => createRestaurantRow(db, shardId, await createAccountRow(db));

describe('effects service', () => {
  it('汇总并缓存；来源变动后重新汇总', async () => {
    const restId = await newRest();
    const now = new Date();
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: 1,
      effects: { atRate: 0.1 },
      expiresAt: null,
    });
    await upsertEffectSource(db, restId, {
      sourceType: 'street',
      sourceId: 140,
      effects: { atRate: 0.35, luckValue: 36 },
      expiresAt: null,
    });
    expect(await getEffectAgg(db, restId, now)).toEqual({ atRate: 0.45, luckValue: 36 });

    // 绕过服务直接改数据：缓存没失效，仍返回旧值（证明走了缓存）
    await db
      .updateTable('effect_source')
      .set({ effects: JSON.stringify({ atRate: 9 }) })
      .where('rest_id', '=', restId)
      .where('source_id', '=', 1)
      .execute();
    expect(await getEffectAgg(db, restId, now)).toEqual({ atRate: 0.45, luckValue: 36 });

    await removeEffectSource(db, restId, 'honor', 1);
    expect(await getEffectAgg(db, restId, now)).toEqual({ atRate: 0.35, luckValue: 36 });
  });

  it('有来源到期时自动重新汇总', async () => {
    const restId = await newRest();
    const now = new Date();
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: 81,
      effects: { expRate: 1 },
      expiresAt: new Date(now.getTime() + 3600_000),
    });
    expect(await getEffectAgg(db, restId, now)).toEqual({ expRate: 1 });
    const twoHoursLater = new Date(now.getTime() + 2 * 3600_000);
    expect(await getEffectAgg(db, restId, twoHoursLater)).toEqual({});
    expect(await listActiveEffects(db, restId, twoHoursLater)).toEqual([]);
  });

  it('同一来源再次写入是更新而不是新增', async () => {
    const restId = await newRest();
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: 5,
      effects: { a: 1 },
      expiresAt: null,
    });
    await upsertEffectSource(db, restId, {
      sourceType: 'honor',
      sourceId: 5,
      effects: { a: 2 },
      expiresAt: null,
    });
    const list = await listActiveEffects(db, restId, new Date());
    expect(list).toHaveLength(1);
    expect(list[0]!.effects).toEqual({ a: 2 });
  });
});
