import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shardId: number;
let accountId: number;
beforeAll(async () => {
  shardId = await createShard(db);
  accountId = await createAccountRow(db);
});

describe('迁移 0003', () => {
  it('角色可以是 mod；非法角色被拒', async () => {
    await db.updateTable('account').set({ role: 'mod' }).where('id', '=', accountId).execute();
    await expect(sql`update account set role = 'boss' where id = ${accountId}`.execute(db)).rejects.toThrow();
  });

  it('shard_config 有 version，默认 0', async () => {
    await db.insertInto('shard_config').values({ shard_id: shardId }).execute();
    const r = await db
      .selectFrom('shard_config')
      .select('version')
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow();
    expect(r.version).toBe(0);
  });

  it('新表可以写入和读出；stat_daily 的 day 读出为字符串', async () => {
    await db
      .insertInto('shard_config_history')
      .values({ shard_id: shardId, version: 1, override: JSON.stringify({}), note: 'n' })
      .execute();
    const g = await db
      .insertInto('admin_grant')
      .values({
        shard_id: shardId,
        target: 'shard',
        items: JSON.stringify({ coin: 1 }),
        reason: 'r',
        status: 'pending',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.insertInto('admin_grant_done').values({ grant_id: g.id, rest_id: 1, ok: true }).execute();
    await db
      .insertInto('stat_daily')
      .values({ shard_id: shardId, day: '2026-09-30', kind: 'coin', source: 'x', amount: 5 })
      .execute();
    const s = await db
      .selectFrom('stat_daily')
      .selectAll()
      .where('shard_id', '=', shardId)
      .executeTakeFirstOrThrow();
    expect(s).toMatchObject({ day: '2026-09-30', amount: 5 });
    expect(typeof g.id).toBe('number');
  });
});
