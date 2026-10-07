import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';
import { up } from './0053_exchange_limits';

const db = testDb();
afterAll(() => db.destroy());

const old = {
  features: { friend: true },
  tuning: {
    friend: { exchange: { base: 12, perDayTotalMul: 5, takenBase: 8, feeRate: 0.3 }, npc: { tables: 20 } },
  },
};
const kept = {
  features: { friend: true },
  tuning: { friend: { exchange: { feeRate: 0.3 }, npc: { tables: 20 } } },
};

describe('迁移 0053：好友换食材次数改成固定总数（问题记录 479）', () => {
  it('删掉区服覆盖和历史版本里已经不存在的旧键，别的设置不动；没写这些键的不变', async () => {
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
    await up(db);
    for (const shardId of [s1, s2]) {
      const cur = await db
        .selectFrom('shard_config')
        .select('override')
        .where('shard_id', '=', shardId)
        .executeTakeFirstOrThrow();
      expect(cur.override).toEqual(kept);
      const hist = await db
        .selectFrom('shard_config_history')
        .select('override')
        .where('shard_id', '=', shardId)
        .execute();
      expect(hist.map((h) => h.override)).toEqual([kept]);
    }
  });
});
