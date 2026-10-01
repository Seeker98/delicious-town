import type { ActivitySpec } from '@dt/shared';
import { activityCacheFor } from '../src/modules/activity/active';
import type { TestGame } from './game';

const H = 3_600_000;

/** 直接写一条活动并清缓存；默认从一小时前开始、一天后结束 */
export async function insertActivity(
  t: TestGame,
  o: {
    shardId: number | null;
    spec: ActivitySpec;
    startsAt?: Date;
    endsAt?: Date;
    minLevel?: number;
    title?: string;
  },
): Promise<number> {
  const now = t.clock.now.getTime();
  const r = await t.db
    .insertInto('activity')
    .values({
      shard_id: o.shardId,
      kind: o.spec.kind,
      title: o.title ?? '测试活动',
      body: '说明',
      starts_at: o.startsAt ?? new Date(now - H),
      ends_at: o.endsAt ?? new Date(now + 24 * H),
      min_level: o.minLevel ?? 1,
      def: JSON.stringify(o.spec.def),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  activityCacheFor(t.deps.bus, t.game.deps).invalidate();
  return r.id;
}

export async function counters(
  t: TestGame,
  activityId: number,
  restId: number,
): Promise<Record<string, number>> {
  const rows = await t.db
    .selectFrom('activity_counter')
    .select(['key', 'count'])
    .where('activity_id', '=', activityId)
    .where('rest_id', '=', restId)
    .execute();
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.count)]));
}
