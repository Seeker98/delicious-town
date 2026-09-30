import type { Kysely } from 'kysely';
import type { Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { JobContext, PeriodicJob } from '../../core/jobs';
import type { DB } from '../../db/schema';
import type { WorldService } from '../world/service';
import { tickPlant, yardPeriod, type EventTuning } from './rules';

/** 一株作物一次自然事件：短事务里只锁作物行（裁定 7）；作物已不在（被收获 / 铲除）或已枯萎时跳过 */
export async function tickOne(
  db: Kysely<DB>,
  plantId: number,
  raining: boolean,
  now: Date,
  rng: Rng,
  e: EventTuning,
): Promise<boolean> {
  return db.transaction().execute(async (tx) => {
    const p = await tx
      .selectFrom('yard_plant')
      .selectAll()
      .where('id', '=', plantId)
      .where('stage', '<', 5)
      .forUpdate()
      .executeTakeFirst();
    if (!p) return false;
    const { next, changed } = tickPlant(p, raining, now, rng, e);
    if (!changed) return false;
    await tx
      .updateTable('yard_plant')
      .set({
        stage: next.stage,
        stage_at: next.stage_at,
        feed_min: next.feed_min,
        harvest_num: next.harvest_num,
        worm: next.worm,
        grass: next.grass,
        dry: next.dry,
      })
      .where('id', '=', plantId)
      .execute();
    return true;
  });
}

/** 一个区服的自然事件（规格书 08 §8.4）：下雨按运行时刻的当前天气（裁定 11）；单株出错记日志继续 */
export async function runYardEvents(
  d: GameDeps,
  world: WorldService,
  shardId: number,
  now: Date,
  log: JobContext['log'],
): Promise<{ plants: number; changed: number; failed: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const raining = (await world.ensure(shardId, now)).weather.type === 2;
  const rng = d.rng();
  const ids = await d.db
    .selectFrom('yard_plant')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('stage', '<', 5)
    .orderBy('id')
    .execute();
  let changed = 0;
  let failed = 0;
  for (const { id } of ids) {
    try {
      if (await tickOne(d.db, id, raining, now, rng, tuning.yard.events)) changed += 1;
    } catch (err) {
      failed += 1;
      log.error({ err, shardId, plantId: id }, 'yard event failed');
    }
  }
  return { plants: ids.length, changed, failed };
}

/** 功能关闭的区服由调度器跳过（裁定 12） */
export function yardJobs(d: GameDeps, world: WorldService): PeriodicJob[] {
  return [
    {
      name: 'yard-events',
      feature: 'yard',
      period: (now, s) => yardPeriod(now, s.tuning.yard.events),
      run: ({ shardId, now, log }) => runYardEvents(d, world, shardId, now, log),
    },
  ];
}
