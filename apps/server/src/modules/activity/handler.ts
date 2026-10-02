import { sql, type Kysely } from 'kysely';
import { gameDay, type Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import type { DB } from '../../db/schema';
import type { EventBus } from '../../events/bus';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { activityCacheFor, type ActiveActivity } from './active';
import { currencyKey, dropDailyKey } from './rules';

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

async function count(
  tx: Kysely<DB>,
  a: ActiveActivity,
  restId: number,
  p: ActionPayload,
  at: Date,
  rng: Rng,
) {
  const spec = a.spec;
  if (spec.kind === 'boost') return;
  // 兑换活动：每条规则按次数掷骰，命中掉货币，每条规则每天有上限（148-2 设计 §4）
  if (spec.kind === 'exchange') {
    const day = gameDay(at);
    for (const [i, rule] of spec.def.drops.entries()) {
      if (rule.key !== p.key) continue;
      let hits = 0;
      for (let k = 0; k < p.n; k++) if (rng.next() < rule.chance) hits++;
      if (hits === 0) continue;
      const dk = dropDailyKey(a.id, i);
      const add = Math.min(hits * rule.num, rule.dailyCap - (await getDaily(tx, restId, dk, day)));
      if (add <= 0) continue;
      await incrementDaily(tx, restId, dk, add, day);
      await bump(tx, a.id, restId, currencyKey(rule.currency), add);
    }
    return;
  }
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
    if (!featureAvailable(await d.shards.settings(e.shardId, tx), 'activity')) return;
    const at = new Date(p.at);
    const rng = d.rng();
    for (const a of await activityCacheFor(bus, d).forShard(e.shardId, tx)) {
      if (at < a.startsAt || at >= a.endsAt) continue;
      if ((p.level ?? 0) < a.minLevel) continue;
      await count(tx, a, e.restId, p, at, rng);
    }
  });
}
