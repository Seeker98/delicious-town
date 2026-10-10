import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { openLot } from './open';

/** 每分钟一次：到点开当天的批次（挂在 bulk 上，区服关了认购就不开新批次） */
export function bulkJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'bulk-open',
      feature: 'bulk',
      period: (now) => now.toISOString().slice(0, 16),
      run: async ({ shardId, now }) => ({ result: await openLot(d, shardId, now) }),
    },
  ];
}
