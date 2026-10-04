import type { Kysely } from 'kysely';
import { createDb, type DB } from '../src/db';
import { testEnvWith } from './helpers';

/**
 * 数查询条数（质量期 ③）：把 db 传给 createTestGame / createTestApp 的 overrides，
 * 再用 count 包住要测的调用。查询条数预算测试用，防止改着改着又变成每条一查
 */
export function queryCounter(): {
  db: Kysely<DB>;
  count<T>(fn: () => Promise<T>): Promise<{ n: number; sqls: string[]; result: T }>;
} {
  let sqls: string[] | null = null;
  const db = createDb(testEnvWith().DATABASE_URL, 5, (sql) => sqls?.push(sql));
  return {
    db,
    async count(fn) {
      sqls = [];
      try {
        const result = await fn();
        return { n: sqls.length, sqls, result };
      } finally {
        sqls = null;
      }
    },
  };
}
