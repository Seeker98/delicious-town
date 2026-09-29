import type { Redis } from 'ioredis';
import type { Kysely } from 'kysely';
import { dropPartitionsBefore, ensureDailyPartitions } from '../db/partitions';
import type { DB } from '../db/schema';
import type { Job } from './scheduler';

export const RETENTION_DAYS = { ledger: 30, news: 30 } as const;
const DAY_MS = 86_400_000;

/** 预建昨天起 5 天的分区，删除超过保留期的分区 */
export async function maintainPartitions(
  db: Kysely<DB>,
  now: Date,
): Promise<{ created: string[]; dropped: string[] }> {
  const created: string[] = [];
  const dropped: string[] = [];
  for (const table of ['ledger', 'news'] as const) {
    created.push(...(await ensureDailyPartitions(db, table, new Date(now.getTime() - DAY_MS), 5)));
    dropped.push(
      ...(await dropPartitionsBefore(db, table, new Date(now.getTime() - RETENTION_DAYS[table] * DAY_MS))),
    );
  }
  return { created, dropped };
}

export function workerJobs(
  deps: { db: Kysely<DB>; redis: Redis },
  now: () => Date = () => new Date(),
): Job[] {
  return [
    {
      name: 'partitions',
      intervalMs: 3_600_000,
      run: async () => {
        await maintainPartitions(deps.db, now());
      },
    },
    {
      name: 'heartbeat',
      intervalMs: 60_000,
      run: async () => {
        await deps.redis.set('worker:heartbeat', now().toISOString(), 'EX', 180);
      },
    },
  ];
}
