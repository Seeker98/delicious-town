import { sql, type Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { GameEvent } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { Op } from '../../core/op';
import type { EventBus } from '../../events/bus';
import type { DB } from '../../db/schema';
import { awardAchievements } from './award';

/** 计数从 prev 涨到 now：跨过门槛的计数类成就 */
export function crossed(config: GameConfig, key: string, prev: number, now: number): string[] {
  const list = config.achievements.byCounter.get(key);
  if (!list) return [];
  return list.filter(({ tier }) => tier.n > prev && tier.n <= now).map(({ tier }) => tier.id);
}

/** 读区服的成就数值（首达、新闻的点数线） */
async function achTuning(d: GameDeps, tx: Kysely<DB>, shardId: number) {
  return (await d.shards.settings(shardId, tx)).tuning.achieve;
}

/**
 * 动作计数（task 模块先把 event_counter 加好）以后看有没有跨过计数类成就的门槛。
 * 要注册在任务处理器后面；别的店的动作（emitActionFor）events 是空的，不弹提示
 */
export function registerAchieveHandlers(bus: EventBus, d: GameDeps): void {
  bus.on('action', async (tx, e) => {
    const p = e.payload as { key: string; n: number; at: string };
    if (!d.config.achievements.byCounter.has(p.key)) return;
    const row = await tx
      .selectFrom('event_counter')
      .select(sql<number>`count::float8`.as('count'))
      .where('rest_id', '=', e.restId)
      .where('key', '=', p.key)
      .executeTakeFirst();
    if (!row) return;
    const ids = crossed(d.config, p.key, row.count - p.n, row.count);
    if (ids.length === 0) return;
    await awardAchievements(tx, d.config, await achTuning(d, tx, e.shardId), {
      shardId: e.shardId,
      restId: e.restId,
      ids,
      now: new Date(p.at),
      backfilled: false,
      events: e.events,
    });
  });
}

/**
 * 不走任务的计数一次加几样（结算每轮的营业银币、轮数等：只记成就用，不算活跃和任务），加完看门槛
 */
export async function bumpCounters(op: Op, entries: Array<[string, number]>): Promise<void> {
  const rows = entries.filter(([, n]) => n > 0);
  if (rows.length === 0) return;
  const out = await op.tx
    .insertInto('event_counter')
    .values(rows.map(([key, n]) => ({ rest_id: op.rest.id, key, count: n })))
    .onConflict((oc) =>
      oc.columns(['rest_id', 'key']).doUpdateSet({ count: sql`event_counter.count + excluded.count` }),
    )
    .returning(['key', sql<number>`count::float8`.as('count')])
    .execute();
  await awardCounters(op, rows, out);
}

/** 计数加完（rows 是加了多少，out 是加完的值）：跨过门槛的记下来。结算把加计数并进写收益的那条语句，再调这个 */
export async function awardCounters(
  op: Op,
  rows: Array<[string, number]>,
  out: Array<{ key: string; count: number }>,
): Promise<void> {
  const add = new Map(rows);
  const ids = out.flatMap((r) => crossed(op.config, r.key, r.count - (add.get(r.key) ?? 0), r.count));
  if (ids.length > 0) await award(op, ids);
}

/** 只记最高值的计数（划拳最长连胜、连败）：比原来高才改，改了看门槛 */
export async function raiseCounter(op: Op, key: string, value: number): Promise<void> {
  const prev = await op.tx
    .selectFrom('event_counter')
    .select(sql<number>`count::float8`.as('count'))
    .where('rest_id', '=', op.rest.id)
    .where('key', '=', key)
    .executeTakeFirst();
  const before = prev?.count ?? 0;
  if (value <= before) return;
  await op.tx
    .insertInto('event_counter')
    .values({ rest_id: op.rest.id, key, count: value })
    .onConflict((oc) => oc.columns(['rest_id', 'key']).doUpdateSet({ count: value }))
    .execute();
  const ids = crossed(op.config, key, before, value);
  if (ids.length > 0) await award(op, ids);
}

async function award(op: Op, ids: string[]): Promise<void> {
  await awardAchievements(op.tx, op.config, op.tuning.achieve, {
    shardId: op.shardId,
    restId: op.rest.id,
    ids,
    now: op.now,
    backfilled: false,
    events: op.events as GameEvent[],
  });
}
