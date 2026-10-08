import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

// bigint（int8）读成 number（银币可能超过 2^31，但远小于 2^53）；date 保持 YYYY-MM-DD 字符串
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

/** 每条查询跑完回调（语句、毫秒）：查询条数预算测试和慢查询日志用（质量期 ③） */
export type OnQuery = (sql: string, ms: number) => void;

/**
 * 连接池参数（性能排查 2026-10-08）：pg 默认空闲 10 秒就断开，线上人少时几乎每个请求都要重新建连接
 * （1 核的服务器上约 14 毫秒，一个页面并发几条查询就建几条）。留最多 4 条常驻，其余空闲 1 分钟再断：
 * 服务器内存小，不让高峰时开的连接一直占着
 */
export function poolOptions(url: string, max: number): pg.PoolConfig {
  return {
    connectionString: url,
    max,
    min: Math.min(4, max),
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
  };
}

export function createDb(url: string, max = 10, onQuery?: OnQuery): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool(poolOptions(url, max)) }),
    log: onQuery
      ? (e) => {
          // 出错的查询也算（backlog 质量期 ③）：慢的失败查询一样要看得到
          onQuery(e.query.sql, e.queryDurationMillis);
        }
      : undefined,
  });
}

export type { DB, RestaurantRow, TableState } from './schema';
