import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

const pool = (shardId: number, seq: number) => ({
  shard_id: shardId,
  day: '2026-10-04',
  seq,
  status: 'open' as const,
  total: 20,
  created_at: new Date(),
});

describe('迁移 0044：一番赏奖池分线（240-2 豪华一番赏）', () => {
  it('不写 line 的池是 normal；同一天两条线可以各有第 1 池；同一条线不能重号；line 只能是 normal 或 deluxe', async () => {
    const shardId = await createShard(db);
    const a = await db
      .insertInto('kuji_pool')
      .values(pool(shardId, 1))
      .returning('line')
      .executeTakeFirstOrThrow();
    expect(a.line).toBe('normal');
    await db
      .insertInto('kuji_pool')
      .values({ ...pool(shardId, 1), line: 'deluxe' })
      .execute();
    await expect(
      db
        .insertInto('kuji_pool')
        .values({ ...pool(shardId, 1), line: 'deluxe' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      db
        .insertInto('kuji_pool')
        .values({ ...pool(shardId, 2), line: 'gold' as 'normal' })
        .execute(),
    ).rejects.toThrow();
  });
});
