import { latestSlot, parseSlotKey } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { weeklyPeriod } from '../friend/weekly';
import { rollHiphopDay } from './day';
import { weekEndPeriod } from './rules';
import { awardWeekly, payWages } from './weekly';

export function hiphopJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'hiphop-daily',
      feature: 'hiphop',
      period: (now, s) => latestSlot(now, [s.tuning.hiphop.hour]).key,
      run: ({ shardId, period, now }) => rollHiphopDay(d, shardId, parseSlotKey(period).day, now),
    },
    {
      name: 'hiphop-weekly',
      feature: 'hiphop',
      period: (now, s) => weekEndPeriod(now, s.tuning.hiphop.weeklyHour),
      run: ({ shardId, period, now, log }) => awardWeekly(d, shardId, period, now, log),
    },
    {
      name: 'hiphop-wage',
      feature: 'hiphop',
      period: (now) => weeklyPeriod(now),
      run: ({ shardId, now, log }) => payWages(d, shardId, now, log),
    },
  ];
}
