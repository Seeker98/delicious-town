import { sql, type Kysely } from 'kysely';
import { featureAvailable } from '../core/features';
import { JobError, type PeriodicJob } from '../core/jobs';
import type { DB } from '../db/schema';
import type { ShardService } from '../modules/shard/service';

export interface PeriodicDeps {
  db: Kysely<DB>;
  shards: ShardService;
  now: () => Date;
  log: { error(obj: object, msg: string): void };
  /**
   * 已经抢过（或看到别人抢了）的周期，跨轮次记住，周期键没变就不再每 5 秒插一次 job_run。
   * 每个循环自己一份（worker 里快、慢两个循环各一个）；不传就每轮都抢，和原来一样
   */
  claims?: ClaimCache;
}

/** 区服:任务 → 最后一次去抢的周期和时刻 */
export type ClaimCache = Map<string, { period: string; at: number }>;

/** 开了 retry 的任务同一周期隔多久再去看一次能不能重抢（重抢本身还有 10 / 30 分钟的条件） */
export const RETRY_CHECK_MS = 60_000;
/** 没开 retry 的也隔一阵再插一次：job_run 七天后会清掉，周期键很久不变的任务清掉后照旧能再跑 */
export const CLAIM_RECHECK_MS = 3_600_000;

export interface JobRunResult {
  shardId: number;
  job: string;
  period: string;
  ok: boolean;
}

/**
 * 对每个开放的区服，执行周期键还没登记过的任务（设计文档 §6）。
 * 先插入 job_run 抢占周期，主键冲突就说明已经执行过；失败记日志和 stats.error。
 * 开了 retry 的任务失败 RETRY_AFTER_MS 以后再抢一次（条件更新，几个 worker 同时来也只有一个抢到），最多 RETRY_MAX 次；
 * 抢占了却一直没写完成也没写出错的（跑到一半进程没了），STALE_AFTER_MS 以后也再抢
 */
export const RETRY_AFTER_MS = 10 * 60_000;
export const STALE_AFTER_MS = 30 * 60_000;
export const RETRY_MAX = 5;

export async function runDueJobs(
  d: PeriodicDeps,
  jobs: PeriodicJob[],
  opts: { shardIds?: number[]; signal?: AbortSignal } = {},
): Promise<JobRunResult[]> {
  let q = d.db.selectFrom('shard').select('id').where('status', '=', 'open');
  if (opts.shardIds) {
    if (opts.shardIds.length === 0) return [];
    q = q.where('id', 'in', opts.shardIds);
  }
  const shards = await q.orderBy('id').execute();
  const results: JobRunResult[] = [];
  for (const { id: shardId } of shards) {
    const settings = await d.shards.settings(shardId);
    for (const job of jobs) {
      // 停止时不再抢新的（稳健性收尾批终审 I2）：抢了跑不完，没开 retry 的那一期就漏了；没抢的下一个 worker 接着跑
      if (opts.signal?.aborted) return results;
      if (!featureAvailable(settings, job.feature)) continue;
      const now = d.now();
      const period = job.period(now, settings);
      if (period === null) continue;
      const key = `${shardId}:${job.name}`;
      const seen = d.claims?.get(key);
      const since = seen && seen.period === period ? now.getTime() - seen.at : null;
      if (since !== null && since >= 0 && since < (job.retry ? RETRY_CHECK_MS : CLAIM_RECHECK_MS)) continue;
      let attempt = 1;
      let claimed = await d.db
        .insertInto('job_run')
        .values({ shard_id: shardId, job: job.name, period, started_at: now })
        .onConflict((oc) => oc.doNothing())
        .returning('period')
        .executeTakeFirst();
      if (!claimed && job.retry) {
        const again = await d.db
          .updateTable('job_run')
          // 抢到时就把次数加 1（终审：原来失败时才写，重跑中途进程崩了会按同一个次数一直重抢）；
          // 上一次的错误同时清掉：这次中途被杀时按“没出错也没完成”30 分钟后再抢（backlog 1010）
          .set({
            started_at: now,
            stats: sql`jsonb_set(stats - 'error', '{attempts}', to_jsonb(coalesce((stats->>'attempts')::int, 1) + 1))`,
          })
          .where('shard_id', '=', shardId)
          .where('job', '=', job.name)
          .where('period', '=', period)
          .where('finished_at', 'is', null)
          .where(sql<number>`coalesce((stats->>'attempts')::int, 1)`, '<', RETRY_MAX)
          // 出错的过 10 分钟；没出错也没完成的（跑到一半进程被杀了）过 30 分钟，免得抢走还在跑的
          .where((eb) =>
            eb.or([
              eb.and([
                eb(sql<boolean>`stats ? 'error'`, '=', true),
                eb('started_at', '<=', new Date(now.getTime() - RETRY_AFTER_MS)),
              ]),
              eb('started_at', '<=', new Date(now.getTime() - STALE_AFTER_MS)),
            ]),
          )
          .returning(sql<number>`(stats->>'attempts')::int`.as('attempts'))
          .executeTakeFirst();
        if (again) {
          claimed = { period };
          attempt = Number(again.attempts);
        }
      }
      // 抢的语句返回了才记（代码审查）：插入或更新本身报错时不记，下一轮照常再抢
      d.claims?.set(key, { period, at: now.getTime() });
      if (!claimed) continue;
      try {
        const stats = await job.run({ shardId, period, now, settings, log: d.log, signal: opts.signal });
        await d.db
          .updateTable('job_run')
          .set({ finished_at: d.now(), stats: JSON.stringify(stats) })
          .where('shard_id', '=', shardId)
          .where('job', '=', job.name)
          .where('period', '=', period)
          .execute();
        results.push({ shardId, job: job.name, period, ok: true });
      } catch (err) {
        d.log.error({ err, shardId, job: job.name, period }, 'periodic job failed');
        await d.db
          .updateTable('job_run')
          .set({
            stats: JSON.stringify({
              ...(err instanceof JobError ? err.stats : {}),
              error: err instanceof Error ? err.message : String(err),
              ...(job.retry ? { attempts: attempt } : {}),
            }),
          })
          .where('shard_id', '=', shardId)
          .where('job', '=', job.name)
          .where('period', '=', period)
          .execute();
        results.push({ shardId, job: job.name, period, ok: false });
      }
    }
  }
  return results;
}
