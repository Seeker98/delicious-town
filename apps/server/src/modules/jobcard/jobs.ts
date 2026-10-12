import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { weeklyPeriod } from '../friend/weekly';
import { weekEndPeriod } from './rules';
import { awardWeekly, payWages } from './weekly';

/** 工作证（天气改版 PR③）：周日 hour 点时令周榜发证，周一 7:59 发工资；时令跟着特色菜的开关 */
export function jobCardJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'jobcard-weekly',
      feature: 'mysterious',
      period: (now, s) => weekEndPeriod(now, s.tuning.jobCard.hour),
      run: ({ shardId, period, now, log }) => awardWeekly(d, shardId, period, now, log),
    },
    {
      name: 'jobcard-wage',
      feature: 'mysterious',
      period: (now) => weeklyPeriod(now),
      run: ({ shardId, now, log }) => payWages(d, shardId, now, log),
    },
  ];
}
