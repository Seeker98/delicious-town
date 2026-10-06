import type { Kysely } from 'kysely';
import { dropPartitionsBefore, ensureDailyPartitions } from '../db/partitions';
import type { DB } from '../db/schema';
import type { Game } from '../game';
import { processGrants } from '../modules/admin/grants';
import { cleanLoginTrace } from '../modules/account/loginTrace';
import { pruneDailyCounters } from '../modules/counter/dailyCounter';
import { runOpsScan } from '../modules/ops/scan';
import { runDueJobs } from './periodic';
import { pullOffset } from '../infra/clock';
import type { Job, JobLogger } from './scheduler';

export const RETENTION_DAYS = { ledger: 30, news: 30, income_round: 3, rest_log: 30 } as const;
const DAY_MS = 86_400_000;

/** 预建昨天起 5 天的分区，删除超过保留期的分区 */
export async function maintainPartitions(
  db: Kysely<DB>,
  now: Date,
): Promise<{ created: string[]; dropped: string[] }> {
  const created: string[] = [];
  const dropped: string[] = [];
  for (const table of Object.keys(RETENTION_DAYS) as Array<keyof typeof RETENTION_DAYS>) {
    created.push(...(await ensureDailyPartitions(db, table, new Date(now.getTime() - DAY_MS), 5)));
    dropped.push(
      ...(await dropPartitionsBefore(db, table, new Date(now.getTime() - RETENTION_DAYS[table] * DAY_MS))),
    );
  }
  await db
    .deleteFrom('job_run')
    .where('started_at', '<', new Date(now.getTime() - 7 * DAY_MS))
    .execute();
  return { created, dropped };
}

export function workerJobs(game: Game, log: JobLogger): Job[] {
  const { db, redis } = game.app;
  const now = () => game.deps.now();
  return [
    {
      // 登录记录只留 30 天（子项目 6B-2）
      name: 'login-trace-clean',
      intervalMs: 6 * 3_600_000,
      run: async () => {
        await cleanLoginTrace(db, now());
      },
    },
    {
      // 每日计数只留 30 天（backlog 374）
      name: 'daily-counter-clean',
      intervalMs: 6 * 3_600_000,
      run: async () => {
        await pruneDailyCounters(db, now());
      },
    },
    {
      name: 'partitions',
      intervalMs: 3_600_000,
      run: async () => {
        await maintainPartitions(db, now());
      },
    },
    {
      name: 'heartbeat',
      intervalMs: 60_000,
      run: async () => {
        await redis.set('worker:heartbeat', now().toISOString(), 'EX', 180);
      },
    },
    {
      name: 'periodic',
      intervalMs: 5_000,
      run: async () => {
        if (game.app.clock) await pullOffset(game.app.clock, game.app.redis);
        await runDueJobs({ db, shards: game.shards, now, log }, game.jobs);
      },
    },
    {
      // 运营扫描（子项目 6A）：六星换铉；6A-2 起还有邀请奖励
      name: 'ops-scan',
      intervalMs: 60_000,
      run: async () => {
        await runOpsScan(game, log);
      },
    },
    {
      name: 'admin-grants',
      intervalMs: 5_000,
      run: async () => {
        await processGrants(game, log);
      },
    },
  ];
}
