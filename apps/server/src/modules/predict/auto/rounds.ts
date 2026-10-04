import type { Kysely } from 'kysely';
import type { DB } from '../../../db/schema';

/**
 * 那一轮周期任务跑完的时间（job_run）；没跑过（功能关着、worker 漏跑）为 null。
 * 自动题判定前先确认那一轮真的刷新过，免得按种子算出一个没出现过的结果（backlog 238-2）
 */
export async function roundFinishedAt(
  db: Kysely<DB>,
  shardId: number,
  job: string,
  period: string,
): Promise<Date | null> {
  const r = await db
    .selectFrom('job_run')
    .select('finished_at')
    .where('shard_id', '=', shardId)
    .where('job', '=', job)
    .where('period', '=', period)
    .where('finished_at', 'is not', null)
    .executeTakeFirst();
  return r?.finished_at ?? null;
}
