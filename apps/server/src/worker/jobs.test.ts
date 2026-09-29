import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { ensureDailyPartitions, partitionName } from '../db/partitions';
import { maintainPartitions } from './jobs';

const db = testDb();
afterAll(() => db.destroy());
const DAY = 86_400_000;

describe('maintainPartitions', () => {
  it('预建未来分区并删除超过保留期的分区', async () => {
    const now = new Date();
    const [old] = await ensureDailyPartitions(db, 'news', new Date(now.getTime() - 45 * DAY), 1);
    const { created, dropped } = await maintainPartitions(db, now);
    const in3Days = new Date(now.getTime() + 3 * DAY).toISOString().slice(0, 10);
    expect(created).toContain(partitionName('ledger', in3Days));
    expect(created).toContain(partitionName('news', in3Days));
    expect(created).toContain(partitionName('income_round', in3Days));
    expect(created).toContain(partitionName('rest_log', in3Days));
    expect(dropped).toContain(old);
    const { rows } = await sql<{
      n: number;
    }>`select count(*)::int as n from pg_class where relname = ${old}`.execute(db);
    expect(rows[0]!.n).toBe(0);
  });
});
