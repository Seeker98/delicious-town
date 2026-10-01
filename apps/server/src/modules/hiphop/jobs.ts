import { latestSlot, parseSlotKey } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { rollHiphopDay } from './day';

export function hiphopJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'hiphop-daily',
      feature: 'hiphop',
      period: (now, s) => latestSlot(now, [s.tuning.hiphop.hour]).key,
      run: ({ shardId, period, now }) => rollHiphopDay(d, shardId, parseSlotKey(period).day, now),
    },
  ];
}
