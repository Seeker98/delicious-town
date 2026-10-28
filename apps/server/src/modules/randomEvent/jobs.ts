import { DAY_MS, gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';

/** 每天清一次保留期以前的记录（设计稿 §8）；挂在 restaurant 上，区服关了随机事件也照常清 */
export function randomEventJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'random-event-clean',
      feature: 'restaurant',
      period: (now) => gameDay(now),
      run: async ({ shardId, now }) => {
        const days = (await d.shards.settings(shardId)).tuning.randomEvents.retainDays;
        const r = await d.db
          .deleteFrom('random_event')
          .where('created_at', '<', new Date(now.getTime() - days * DAY_MS))
          .where('rest_id', 'in', (eb) =>
            eb.selectFrom('restaurant').select('restaurant.id').where('restaurant.shard_id', '=', shardId),
          )
          .executeTakeFirst();
        return { deleted: Number(r.numDeletedRows) };
      },
    },
  ];
}
