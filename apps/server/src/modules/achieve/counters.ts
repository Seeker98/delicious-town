import { sql, type Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { GameEvent } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { setStatHook, type Op } from '../../core/op';
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
async function achTuning(d: Pick<GameDeps, 'shards'>, tx: Kysely<DB>, shardId: number) {
  return (await d.shards.settings(shardId, tx)).tuning.achieve;
}

/**
 * 动作计数（task 模块先把 event_counter 加好）以后看有没有跨过计数类成就的门槛。
 * 要注册在任务处理器后面；别的店的动作（emitActionFor）events 是空的，不弹提示
 */
/** 已经注册过的总线：同一个总线上多次 createGame 也只注册一次（和任务处理器一样） */
const registered = new WeakSet<EventBus>();

/** 等级、星级、声望这三样状态类：操作写回前比一比开始时的值，跨档的当场记（升级、升星时就弹提示、写动态）；银币看隐藏成就 */
const STAT_METRICS: Array<[string, 'level' | 'star_level' | 'renown']> = [
  ['state:level', 'level'],
  ['state:star', 'star_level'],
  ['state:renown', 'renown'],
];
export async function statCrossed(op: Op): Promise<void> {
  const ids: string[] = [];
  for (const [metric, col] of STAT_METRICS) {
    const before = op.initial[col];
    const now = op.rest[col];
    if (now <= before) continue;
    for (const { tier } of op.config.achievements.stateTiers)
      if (tier.metric === metric && tier.n > before && tier.n <= now) ids.push(tier.id);
  }
  if (ids.length > 0) await award(op, ids);
  // 隐藏成就：银币余额落到恰好 0、1、8,888,888（这次操作里变了才算；中途经过的不算）
  const coin = op.rest.coin;
  if (coin !== op.initial.coin && !op.rest.npc) {
    const key = COIN_EXACT.get(coin);
    if (key) await bumpCounters(op, [[key, 1]]);
  }
}

/** 银币余额恰好是这几个数：身无分文、一枚铜板、发发发 */
const COIN_EXACT = new Map([
  [0, 'coin.zero'],
  [1, 'coin.one'],
  [8_888_888, 'coin.eights'],
]);

export function registerAchieveHandlers(bus: EventBus, d: GameDeps): void {
  setStatHook(statCrossed);
  if (registered.has(bus)) return;
  registered.add(bus);
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
  if (op.rest.npc) return;
  const rows = entries.filter(([, n]) => n > 0);
  if (rows.length === 0) return;
  const out = await upsertCounters(op.tx, op.rest.id, rows);
  await awardCounters(op, rows, out);
}

function upsertCounters(tx: Kysely<DB>, restId: number, rows: Array<[string, number]>) {
  return tx
    .insertInto('event_counter')
    .values(rows.map(([key, n]) => ({ rest_id: restId, key, count: n })))
    .onConflict((oc) =>
      oc.columns(['rest_id', 'key']).doUpdateSet({ count: sql`event_counter.count + excluded.count` }),
    )
    .returning(['key', sql<number>`count::float8`.as('count')])
    .execute();
}

/**
 * 没有 Op 的地方（区服任务：卫生巡查、酒吧周冠军）给一家店加计数、看门槛。
 * 不锁餐厅行（成就记在 rest_ach、rest_achievement），不弹提示；蟹老板的店（交易所系统挂单）不记
 */
export async function bumpCountersFor(
  d: Pick<GameDeps, 'config' | 'shards'>,
  tx: Kysely<DB>,
  o: { shardId: number; restId: number; now: Date },
  entries: Array<[string, number]>,
): Promise<void> {
  const rows = entries.filter(([, n]) => n > 0);
  if (rows.length === 0) return;
  const rest = await tx.selectFrom('restaurant').select('npc').where('id', '=', o.restId).executeTakeFirst();
  if (!rest || rest.npc) return;
  const out = await upsertCounters(tx, o.restId, rows);
  const add = new Map(rows);
  const ids = out.flatMap((r) => crossed(d.config, r.key, r.count - (add.get(r.key) ?? 0), r.count));
  if (ids.length === 0) return;
  await awardAchievements(tx, d.config, await achTuning(d, tx, o.shardId), { ...o, ids, backfilled: false });
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
  // 一条语句：WITH 里读到的是改之前的值；只在更高时改
  const { rows } = await sql<{ before: number | null }>`
    with prev as (select count from event_counter where rest_id = ${op.rest.id} and key = ${key})
    insert into event_counter (rest_id, key, count) values (${op.rest.id}, ${key}, ${value})
    on conflict (rest_id, key) do update set count = greatest(event_counter.count, excluded.count)
    returning (select count::float8 from prev) as before`.execute(op.tx);
  const before = rows[0]?.before ?? 0;
  if (value <= before) return;
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
