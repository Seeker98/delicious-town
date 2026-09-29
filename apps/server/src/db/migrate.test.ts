import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { migrateToLatest } from './migrate';

const db = testDb();
afterAll(() => db.destroy());

describe('migrations', () => {
  it('创建了全部表', async () => {
    const { rows } = await sql<{ table_name: string }>`
      select table_name from information_schema.tables where table_schema = 'public'`.execute(db);
    const names = rows.map((r) => r.table_name);
    for (const t of [
      'account',
      'email_token',
      'shard',
      'shard_config',
      'restaurant',
      'restaurant_tables',
      'restaurant_cookbooks',
      'effect_source',
      'store_item',
      'daily_counter',
      'ledger',
      'news',
      'audit_log',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('重复执行不报错', async () => {
    await expect(migrateToLatest(db)).resolves.toBeUndefined();
  });

  it('用户名大小写不敏感唯一', async () => {
    await db
      .insertInto('account')
      .values({ username: 'CaseTest', password_hash: 'x', email: 'case1@t.local' })
      .execute();
    await expect(
      db
        .insertInto('account')
        .values({ username: 'casetest', password_hash: 'x', email: 'case2@t.local' })
        .execute(),
    ).rejects.toMatchObject({ code: '23505', constraint: 'account_username_lower' });
  });

  it('bigint 读出为 number', async () => {
    const { rows } = await sql<{ n: number }>`select 9007199254740991::bigint as n`.execute(db);
    expect(rows[0]!.n).toBe(9007199254740991);
  });
});
