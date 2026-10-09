import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0060：小镇日报表', () => {
  it('每区服每天一行；状态只能是 pending/draft/published/hidden', async () => {
    const shardId = await createShard(db);
    const row = { shard_id: shardId, day: '2026-10-07', status: 'pending' as const, facts: '{}' };
    await db.insertInto('town_daily').values(row).execute();
    await expect(db.insertInto('town_daily').values(row).execute()).rejects.toThrow();
    await expect(
      db
        .insertInto('town_daily')
        // @ts-expect-error 非法状态
        .values({ ...row, day: '2026-10-08', status: 'bogus' })
        .execute(),
    ).rejects.toThrow();
    const r = await db
      .selectFrom('town_daily')
      .selectAll()
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow();
    expect(r).toMatchObject({ tokens_in: 0, tokens_out: 0, attempts: 0, regenerations: 0, content: null });
  });
});
