import { sql, type Kysely } from 'kysely';
import { createDb } from '../src/db';
import type { PartitionedTable } from '../src/db/partitions';
import type { DB } from '../src/db/schema';

export function testDb() {
  return createDb(process.env.DATABASE_URL!, 5);
}

const DAY = 86_400_000;

/**
 * 分区测试要给“很早以前的某一天”建分区，再看它被清掉。别的测试文件用固定的测试时钟写过的行（比如 2026-10 的新闻、流水）
 * 在没有对应分区时落在 <表>_default 里；给那一天建分区会报 23514（default 里有属于新分区的行）。
 * 从 minDays 天前往前找一天，default 里没有那一天的行就用它（UTC 日的 0 点）
 */
export async function emptyOldDay(
  db: Kysely<DB>,
  table: PartitionedTable,
  now: Date,
  minDays: number,
): Promise<Date> {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let d = minDays; d < minDays + 3650; d++) {
    const start = new Date(today - d * DAY);
    const end = new Date(today - (d - 1) * DAY);
    const { rows } = await sql<{ n: number }>`select count(*)::int as n from ${sql.id(`${table}_default`)}
      where created_at >= ${start} and created_at < ${end}`.execute(db);
    if (rows[0]!.n === 0) return start;
  }
  throw new Error(`emptyOldDay: no empty day in ${table}_default`);
}
