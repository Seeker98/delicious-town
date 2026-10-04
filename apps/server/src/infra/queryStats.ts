import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';
import type { OnQuery } from '../db';
import type { Env } from '../env';

/**
 * 查询统计（质量期 ③ 性能）：
 * - DB_QUERY_STATS：每个请求数自己的查询条数和耗时，写进 Server-Timing 响应头（浏览器开发者工具、压测脚本直接看）；
 * - DB_SLOW_MS：超过阈值的查询打一条警告（API 和 worker 都算）。
 * 默认都关，不关时 createDb 不挂回调，没有额外开销。
 */
interface Stats {
  n: number;
  ms: number;
}
const als = new AsyncLocalStorage<Stats>();
/** 慢查询日志里语句最多留多长 */
const SQL_MAX = 500;

/** 给 createDb 的回调；两个开关都关时为 undefined */
export function queryHook(env: Pick<Env, 'DB_QUERY_STATS' | 'DB_SLOW_MS'>): OnQuery | undefined {
  if (!env.DB_QUERY_STATS && env.DB_SLOW_MS <= 0) return undefined;
  return (sql, ms) => {
    const s = als.getStore();
    if (s) {
      s.n += 1;
      s.ms += ms;
    }
    if (env.DB_SLOW_MS > 0 && ms >= env.DB_SLOW_MS)
      // 和 pino 一样一行 JSON（level 40 = warn）；worker 没有 Fastify 的 logger，所以直接写 stderr
      process.stderr.write(
        JSON.stringify({
          level: 40,
          time: Date.now(),
          msg: 'slow query',
          ms: Math.round(ms),
          sql: sql.slice(0, SQL_MAX),
        }) + '\n',
      );
  };
}

/** 打开 DB_QUERY_STATS 时注册：每个请求一份计数，发送前写 Server-Timing（db = 查询，app = 到发送前的总耗时） */
export function registerQueryStats(app: FastifyInstance, env: Pick<Env, 'DB_QUERY_STATS'>): void {
  if (!env.DB_QUERY_STATS) return;
  const byReq = new WeakMap<object, Stats>();
  app.addHook('onRequest', (req, _reply, done) => {
    const s = { n: 0, ms: 0 };
    byReq.set(req, s);
    als.run(s, done);
  });
  app.addHook('onSend', async (req, reply, payload) => {
    const s = byReq.get(req);
    if (s)
      reply.header(
        'server-timing',
        `db;dur=${s.ms.toFixed(1)};desc="${s.n} queries", app;dur=${reply.elapsedTime.toFixed(1)}`,
      );
    return payload;
  });
}
