import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';
import { stripStatsOverrides } from './0080_predict_wish';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0080：全服营业银币自动题换成许愿树题', () => {
  it('区服覆盖和历史版本里删掉 predict.auto.stats、statsCloseHour，别的设置不动', async () => {
    const old = {
      tuning: { predict: { minLevel: 15, auto: { stats: false, statsCloseHour: 12, krab: false } } },
    };
    const kept = { tuning: { predict: { minLevel: 15, auto: { krab: false } } } };
    const s1 = await createShard(db);
    const s2 = await createShard(db);
    for (const [shardId, override] of [
      [s1, old],
      [s2, kept],
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
    await stripStatsOverrides(db);
    for (const shardId of [s1, s2]) {
      const cur = await db
        .selectFrom('shard_config')
        .select('override')
        .where('shard_id', '=', shardId)
        .executeTakeFirstOrThrow();
      const hist = await db
        .selectFrom('shard_config_history')
        .select('override')
        .where('shard_id', '=', shardId)
        .executeTakeFirstOrThrow();
      expect(cur.override).toEqual(kept);
      expect(hist.override).toEqual(kept);
    }
  });
});
