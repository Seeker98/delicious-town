import { gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { decayShiling } from './store';

/** 时令值每日衰减（时令值改法 2026-10-13）：每个游戏日一次；时令跟着特色菜的开关 */
export function shilingJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'shiling-decay',
      feature: 'mysterious',
      period: (now) => gameDay(now),
      run: ({ shardId, now, log }) => decayShiling(d, shardId, now, log),
    },
  ];
}
