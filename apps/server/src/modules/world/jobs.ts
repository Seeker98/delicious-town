import { latestSlot, parseSlotKey } from '@dt/shared';
import type { PeriodicJob } from '../../core/jobs';
import type { WorldService } from './service';

export function worldJobs(world: WorldService): PeriodicJob[] {
  return [
    {
      name: 'weather',
      feature: 'world',
      period: (now, s) => latestSlot(now, s.tuning.world.weatherHours).key,
      run: ({ shardId, period, now }) => world.changeWeather(shardId, parseSlotKey(period), now),
    },
    {
      name: 'daily-event',
      feature: 'world',
      period: (now, s) => latestSlot(now, [s.tuning.world.krabHour]).key,
      run: ({ shardId, period, now }) => world.changeKrabStreet(shardId, parseSlotKey(period), now),
    },
  ];
}
