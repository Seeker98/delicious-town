import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0052：backlog 一轮修复（2026-10-07）', () => {
  it('收购拦截记下关联的账号，可以为空（旧记录）；账号删了置空', async () => {
    const shardId = await createShard(db);
    const a = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const b = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const linked = await createAccountRow(db);
    const row = {
      shard_id: shardId,
      buyer_rest_id: a,
      target_rest_id: b,
      reason: 'ip' as const,
      created_at: new Date(),
    };
    await db.insertInto('acquire_block').values(row).execute();
    const { id } = await db
      .insertInto('acquire_block')
      .values({ ...row, linked_account_id: linked })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.deleteFrom('account').where('id', '=', linked).execute();
    const got = await db
      .selectFrom('acquire_block')
      .select('linked_account_id')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(got.linked_account_id).toBeNull();
  });

  it('每日计数表按天有索引（清理旧计数不再全表扫，问题记录 374 遗留）', async () => {
    const r = await sql<{
      indexdef: string;
    }>`select indexdef from pg_indexes where tablename = 'daily_counter' and indexname = 'daily_counter_day'`.execute(
      db,
    );
    expect(r.rows[0]?.indexdef).toMatch(/\(day\)/);
  });
});
