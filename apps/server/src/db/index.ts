import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

// bigint（int8）读成 number（银币可能超过 2^31，但远小于 2^53）；date 保持 YYYY-MM-DD 字符串
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

/** 每条查询跑完回调（语句、毫秒）：查询条数预算测试和慢查询日志用（质量期 ③） */
export type OnQuery = (sql: string, ms: number) => void;

export function createDb(url: string, max = 10, onQuery?: OnQuery): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 10_000 }),
    }),
    log: onQuery
      ? (e) => {
          if (e.level === 'query') onQuery(e.query.sql, e.queryDurationMillis);
        }
      : undefined,
  });
}

export type { DB, RestaurantRow, TableState } from './schema';
