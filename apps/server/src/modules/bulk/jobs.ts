import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { openLot } from './open';
import { freezeDue } from './service';
import { closeDue, payOut } from './settle';

/**
 * 每分钟一次：到点开当天的批次（挂在 bulk 上，区服关了认购就不开新批次）；
 * 收盘结算挂在 restaurant 上，关了认购也照常结算进行中的批次、退回冻结的银币
 */
export function bulkJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'bulk-open',
      feature: 'bulk',
      period: (now) => now.toISOString().slice(0, 16),
      run: async ({ shardId, now }) => ({ result: await openLot(d, shardId, now) }),
    },
    {
      name: 'bulk-settle',
      feature: 'restaurant',
      period: (now) => now.toISOString().slice(0, 16),
      run: async ({ shardId, now, log }) => ({
        // 先写停更快照（问题记录 595），再收盘、结算
        frozen: await freezeDue(d, shardId, now),
        closed: await closeDue(d, shardId, now),
        ...(await payOut(d, shardId, now, log)),
      }),
    },
  ];
}
