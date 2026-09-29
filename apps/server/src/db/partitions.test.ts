import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { dropPartitionsBefore, ensureDailyPartitions, partitionName } from './partitions';

const db = testDb();
afterAll(() => db.destroy());
const DAY = 86_400_000;

describe('daily partitions', () => {
  it('命名规则', () => {
    expect(partitionName('ledger', '2026-09-29')).toBe('ledger_p20260929');
  });

  it('预建分区后可以写入，并能删除过期分区', async () => {
    const now = new Date();
    const created = await ensureDailyPartitions(db, 'ledger', now, 2);
    expect(created).toHaveLength(2);
    await db.insertInto('ledger').values({ rest_id: 1, kind: 'coin', delta: 5, source: 'test' }).execute();

    const old = new Date(now.getTime() - 40 * DAY);
    const [oldName] = await ensureDailyPartitions(db, 'ledger', old, 1);
    const dropped = await dropPartitionsBefore(db, 'ledger', new Date(now.getTime() - 30 * DAY));
    expect(dropped).toContain(oldName);
    expect(dropped).not.toContain(created[0]);

    const { rows } = await sql<{
      n: number;
    }>`select count(*)::int as n from pg_class where relname = ${oldName}`.execute(db);
    expect(rows[0]!.n).toBe(0);
  });

  it('重复预建是幂等的', async () => {
    const now = new Date();
    await ensureDailyPartitions(db, 'news', now, 1);
    await expect(ensureDailyPartitions(db, 'news', now, 1)).resolves.toHaveLength(1);
  });
});
