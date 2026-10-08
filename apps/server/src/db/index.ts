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
    // 常驻的也 30 分钟换一次：长寿的连接会一直攒按天分区的表的缓存，人少时栈底的几条可能几天不用（性能排查终审遗留）
    maxLifetimeSeconds: 1800,
    connectionTimeoutMillis: 10_000,
  };
}

export function createPool(url: string, max: number): pg.Pool {
  const pool = new pg.Pool(poolOptions(url, max));
  // 空闲连接被服务端断开（Postgres 重启、backend 被杀、网络抖动）时池子会发 error：没人接就是未捕获异常，
  // api、worker 全崩。出错的连接 pg-pool 已经移出池子，这里只记日志（终审 I1：常驻连接让这事从偶发变成必然）
  pool.on('error', (err) => console.warn('idle pg client error', err.message));
  return pool;
}

export function createDb(url: string, max = 10, onQuery?: OnQuery): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: createPool(url, max) }),
    log: onQuery
      ? (e) => {
          // 出错的查询也算（backlog 质量期 ③）：慢的失败查询一样要看得到
          onQuery(e.query.sql, e.queryDurationMillis);
        }
      : undefined,
  });
}

export type { DB, RestaurantRow, TableState } from './schema';
