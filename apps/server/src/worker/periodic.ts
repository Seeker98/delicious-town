import type { Kysely } from 'kysely';
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
 * 先插入 job_run 抢占周期，主键冲突就说明已经执行过；失败只记日志、不重试。
 */
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
      const claimed = await d.db
        .insertInto('job_run')
        .values({ shard_id: shardId, job: job.name, period, started_at: now })
        .onConflict((oc) => oc.doNothing())
        .returning('period')
        .executeTakeFirst();
      if (!claimed) continue;
      try {
        const stats = await job.run({ shardId, period, now, settings });
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
          .set({ stats: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) })
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
