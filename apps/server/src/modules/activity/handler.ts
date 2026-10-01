import { sql, type Kysely } from 'kysely';
import { gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import type { DB } from '../../db/schema';
import type { EventBus } from '../../events/bus';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { activityCacheFor, type ActiveActivity } from './active';

interface ActionPayload {
  key: string;
  n: number;
  level?: number;
  at: string;
}

export const passDailyKey = (activityId: number, key: string) => `act${activityId}:${key}`;

async function bump(tx: Kysely<DB>, activityId: number, restId: number, key: string, by: number) {
  await tx
    .insertInto('activity_counter')
    .values({ activity_id: activityId, rest_id: restId, key, count: by })
    .onConflict((oc) =>
      oc
        .columns(['activity_id', 'rest_id', 'key'])
        .doUpdateSet({ count: sql<string>`activity_counter.count + ${by}` }),
    )
    .execute();
}

async function count(tx: Kysely<DB>, a: ActiveActivity, restId: number, p: ActionPayload, at: Date) {
  const spec = a.spec;
  if (spec.kind === 'pass') {
    const rule = spec.def.rules.find((r) => r.key === p.key);
    if (!rule) return;
    const day = gameDay(at);
    const dk = passDailyKey(a.id, p.key);
    const add = Math.min(rule.points * p.n, rule.dailyCap - (await getDaily(tx, restId, dk, day)));
    if (add <= 0) return;
    await incrementDaily(tx, restId, dk, add, day);
    await bump(tx, a.id, restId, 'points', add);
    return;
  }
  const keys = spec.kind === 'goals' ? spec.def.goals.map((g) => g.key) : spec.def.cells.map((c) => c.key);
  if (keys.includes(p.key)) await bump(tx, a.id, restId, p.key, p.n);
}

const registered = new WeakSet<EventBus>();

/** 行为 → 活动计数（设计 §4.2）；和任务计数同一个事务 */
export function registerActivityHandlers(bus: EventBus, d: GameDeps): void {
  if (registered.has(bus)) return;
  registered.add(bus);
  bus.on('action', async (tx, e) => {
    const p = e.payload as unknown as ActionPayload;
    if (!featureAvailable(await d.shards.settings(e.shardId), 'activity')) return;
    const at = new Date(p.at);
    for (const a of await activityCacheFor(bus, d).forShard(e.shardId)) {
      if (at < a.startsAt || at >= a.endsAt) continue;
      if ((p.level ?? 0) < a.minLevel) continue;
      await count(tx, a, e.restId, p, at);
    }
  });
}
