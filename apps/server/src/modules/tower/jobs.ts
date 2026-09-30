import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { cookWatchmen, watchmanPeriod } from './watchman';

export function towerJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'tower-watchman',
      feature: 'tower',
      period: (now, s) => watchmanPeriod(now, s.tuning.tower),
      run: async ({ shardId, period, settings }) => ({
        floors: await cookWatchmen(d.db, d.config, shardId, period, d.rng(), settings.tuning.tower),
      }),
    },
  ];
}
