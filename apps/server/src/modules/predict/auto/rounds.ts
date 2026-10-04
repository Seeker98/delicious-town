import type { Kysely } from 'kysely';
import type { DB } from '../../../db/schema';

/**
 * 那一轮周期任务（job_run）的开始和跑完时间；没跑完（功能关着、worker 漏跑、出错）为 null。
 * 自动题判定前先确认那一轮真的刷新过，免得按种子算出一个没出现过的结果（backlog 238-2）
 */
export async function finishedRound(
  db: Kysely<DB>,
  shardId: number,
  job: string,
  period: string,
): Promise<{ startedAt: Date; finishedAt: Date } | null> {
  const r = await db
    .selectFrom('job_run')
    .select(['started_at', 'finished_at'])
    .where('shard_id', '=', shardId)
    .where('job', '=', job)
    .where('period', '=', period)
    .where('finished_at', 'is not', null)
    .executeTakeFirst();
  return r?.finished_at ? { startedAt: r.started_at, finishedAt: r.finished_at } : null;
}

/** 那一轮跑完的时间；没跑完为 null */
export async function roundFinishedAt(
  db: Kysely<DB>,
  shardId: number,
  job: string,
  period: string,
): Promise<Date | null> {
  return (await finishedRound(db, shardId, job, period))?.finishedAt ?? null;
}
