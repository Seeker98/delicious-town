import { latestSlot, parseSlotKey } from '@dt/shared';
import type { PeriodicJob } from '../../core/jobs';
import type { ShopService } from './service';

export function shopJobs(shop: ShopService): PeriodicJob[] {
  return [
    {
      name: 'shop-special',
      feature: 'shop',
      period: (now, s) => latestSlot(now, [s.tuning.shop.specialHour]).key,
      run: ({ shardId, period, now }) => shop.rollSpecial(shardId, parseSlotKey(period), now),
    },
  ];
}
