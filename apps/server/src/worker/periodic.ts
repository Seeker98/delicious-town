import { sql, type Kysely } from 'kysely';
import { featureAvailable } from '../core/features';
import type { PeriodicJob } from '../core/jobs';
import type { DB } from '../db/schema';
import type { ShardService } from '../modules/shard/service';

export interface PeriodicDeps {
  db: Kysely<DB>;
  shards: ShardService;
  now: () => Date;
  log: { error(obj: object, msg: string): void };
}

export interface JobRunResult {
  shardId: number;
  job: string;
  period: string;
  ok: boolean;
}

/**
 * 对每个开放的区服，执行周期键还没登记过的任务（设计文档 §6）。
 * 先插入 job_run 抢占周期，主键冲突就说明已经执行过；失败记日志和 stats.error。
 * 开了 retry 的任务失败 RETRY_AFTER_MS 以后再抢一次（条件更新，几个 worker 同时来也只有一个抢到），最多 RETRY_MAX 次
 */
export const RETRY_AFTER_MS = 10 * 60_000;
export const RETRY_MAX = 5;

export async function runDueJobs(
  d: PeriodicDeps,
  jobs: PeriodicJob[],
  opts: { shardIds?: number[] } = {},
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
      if (!featureAvailable(settings, job.feature)) continue;
      const now = d.now();
      const period = job.period(now, settings);
      if (period === null) continue;
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
          // 抢到时就把次数加 1（终审：原来失败时才写，重跑中途进程崩了会按同一个次数一直重抢）
          .set({
            started_at: now,
            stats: sql`jsonb_set(stats, '{attempts}', to_jsonb(coalesce((stats->>'attempts')::int, 1) + 1))`,
          })
          .where('shard_id', '=', shardId)
          .where('job', '=', job.name)
          .where('period', '=', period)
          .where('finished_at', 'is', null)
          .where(sql<boolean>`stats ? 'error'`)
          .where(sql<number>`coalesce((stats->>'attempts')::int, 1)`, '<', RETRY_MAX)
          .where('started_at', '<=', new Date(now.getTime() - RETRY_AFTER_MS))
          .returning(sql<number>`(stats->>'attempts')::int`.as('attempts'))
          .executeTakeFirst();
        if (again) {
          claimed = { period };
          attempt = Number(again.attempts);
        }
      }
      if (!claimed) continue;
      try {
        const stats = await job.run({ shardId, period, now, settings, log: d.log });
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
