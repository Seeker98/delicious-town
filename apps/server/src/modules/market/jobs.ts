import type { Tuning } from '@dt/config';
import { latestSlot, parseSlotKey } from '@dt/shared';
import type { PeriodicJob } from '../../core/jobs';
import type { Shelf } from './rules';
import type { MarketService } from './service';

export function marketJobs(market: MarketService): PeriodicJob[] {
  const job = (name: string, shelf: Shelf, hours: (t: Tuning['market']) => number[]): PeriodicJob => ({
    name,
    feature: 'market',
    period: (now, s) => latestSlot(now, hours(s.tuning.market)).key,
    run: ({ shardId, period, now, log }) => market.refresh(shardId, shelf, parseSlotKey(period), now, log),
  });
  return [
    job('market-daily', 0, (t) => t.dailyHours),
    job('market-special', 1, (t) => t.specialHours),
    job('market-premium', 2, (t) => t.premiumHours),
  ];
}
