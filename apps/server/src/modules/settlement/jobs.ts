import { roundOf } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import type { WorldService } from '../world/service';
import { mouseRound } from './mouse';
import { settleShardRound } from './runner';
import { regenStrength } from './strength';

const TEN_MINUTES = 600_000;
const HALF_HOUR = 1_800_000;

export function settlementJobs(d: GameDeps, world: WorldService): PeriodicJob[] {
  return [
    {
      name: 'settlement',
      feature: 'settlement',
      period: (now) => String(roundOf(now)),
      run: ({ shardId, period, now, log }) =>
        settleShardRound(d, world, shardId, Number(period), now, { log }),
    },
    {
      name: 'strength',
      feature: 'settlement',
      period: (now) => String(Math.floor(now.getTime() / TEN_MINUTES)),
      run: ({ shardId, period, now }) => regenStrength(d, shardId, period, now),
    },
    {
      name: 'mouse',
      feature: 'settlement',
      period: (now) => String(Math.floor(now.getTime() / HALF_HOUR)),
      run: ({ shardId, period, now }) => mouseRound(d, shardId, period, now),
    },
  ];
}
