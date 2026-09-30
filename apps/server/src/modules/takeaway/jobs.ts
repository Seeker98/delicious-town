import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { cleanupOrders, fillPublic } from './orders';
import { takeawayPeriod } from './rules';

export function takeawayJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'takeaway-orders',
      feature: 'takeaway',
      period: (now) => takeawayPeriod(now),
      run: async ({ shardId, now, settings }) => {
        const t = settings.tuning.takeaway;
        const removed = await cleanupOrders(d.db, shardId, now, t);
        const created = await fillPublic(d.db, d.config, shardId, now, d.rng(), t);
        return { created, removed };
      },
    },
  ];
}
