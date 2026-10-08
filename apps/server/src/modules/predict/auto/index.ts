import { gameDay, initialShares, type Rng } from '@dt/shared';
import type { GameDeps } from '../../../core/deps';
import { featureAvailable } from '../../../core/features';
import { finalizeEvent } from '../finalize';
import { hiphop } from './hiphop';
import { krab } from './krab';
import { market } from './market';
import { stats } from './stats';
import type { AutoKind } from './types';
import { weather } from './weather';

const KINDS: Record<AutoKind['kind'], AutoKind> = { krab, hiphop, market, weather, stats };
const GIVE_UP_MS = 24 * 3_600_000;

type Log = { error(obj: object, msg: string): void; info?(obj: object, msg: string): void };
const noLog: Log = { error: () => undefined };

/** 出当天的自动题（238-2 设计 §5.2）：每类一题，auto_key 唯一，重跑不重复 */
export async function createAutoEvents(
  d: GameDeps,
  shardId: number,
  now: Date,
  rng: Rng = d.rng(),
  log: Log = noLog,
): Promise<{ created: string[] }> {
  const settings = await d.shards.settings(shardId);
  const t = settings.tuning.predict;
  const day = gameDay(now);
  // 每类按顺序试，前一个出不了（返回 null 或出错）换下一个：双数日嘻哈男孩出不了改出蟹老板（backlog 238-2）
  const plan: Array<[string, AutoKind[]]> = [];
  if (t.auto.krab) {
    const odd = Number(day.slice(8)) % 2 === 1;
    plan.push(['krab', odd || !featureAvailable(settings, 'hiphop') ? [krab] : [hiphop, krab]]);
  }
  if (t.auto.market) plan.push(['market', [market]]);
  if (t.auto.weather) plan.push(['weather', [weather]]);
  if (t.auto.stats) plan.push(['stats', [stats]]);
  const created: string[] = [];
  for (const [flag, kinds] of plan) {
    const autoKey = `${flag}:${day}`;
    const exists = await d.db
      .selectFrom('predict_event')
      .select('id')
      .where('shard_id', '=', shardId)
      .where('auto_key', '=', autoKey)
      .executeTakeFirst();
    if (exists) continue;
    // 一类出错不影响其他类（终审 I2）：周期任务认领后不重跑，出错的这一类当天就不出了
    let dr: Awaited<ReturnType<AutoKind['create']>> = null;
    let k: AutoKind = kinds[0]!;
    for (const cand of kinds) {
      k = cand;
      try {
        dr = await cand.create({ d, shardId, settings, now, day, rng });
      } catch (err) {
        log.error({ err, shardId, kind: cand.kind }, 'predict auto create failed');
        dr = null;
      }
      if (dr && dr.closeAt > now) break;
      dr = null;
    }
    // 出不了的一类写日志，便于查"今天为什么少了一题"（backlog 238-2）
    if (!dr) {
      log.info?.({ shardId, flag }, 'predict auto skipped');
      continue;
    }
    const s = initialShares(dr.p0, t.auto.b);
    const r = await d.db
      .insertInto('predict_event')
      .values({
        shard_id: shardId,
        kind: k.kind,
        title: dr.title,
        description: dr.description,
        params: JSON.stringify(dr.params),
        b: t.auto.b,
        unit: t.unit,
        q_yes: s.y,
        q_no: s.n,
        p0: dr.p0,
        open_at: now,
        close_at: dr.closeAt,
        status: 'open',
        auto_key: autoKey,
        resolve_at: dr.resolveAt,
      })
      .onConflict((oc) => oc.columns(['shard_id', 'auto_key']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (r) created.push(flag);
  }
  return { created };
}

/** 判定到时间的自动题（238-2 设计 §5.3）：判出来写结果和依据；过 24 小时判不了就作废 */
export async function resolveAutoEvents(
  d: GameDeps,
  shardId: number,
  now: Date,
  log: Log = noLog,
): Promise<{ resolved: number; voided: number }> {
  const due = await d.db
    .selectFrom('predict_event')
    .select(['id', 'kind', 'params', 'resolve_at'])
    .where('shard_id', '=', shardId)
    .where('auto_key', 'is not', null)
    .where('status', 'in', ['open', 'closed'])
    .where('resolve_at', '<=', now)
    .orderBy('id')
    .execute();
  if (due.length === 0) return { resolved: 0, voided: 0 };
  const settings = await d.shards.settings(shardId);
  let resolved = 0;
  let voided = 0;
  for (const e of due) {
    const k = KINDS[e.kind as AutoKind['kind']];
    if (!k) continue;
    // 判定出错按"还判不了"处理（终审 I2）：不挡住后面的事件，过了 24 小时照样作废
    let r: Awaited<ReturnType<AutoKind['resolve']>> = null;
    try {
      r = await k.resolve({ d, shardId, settings }, e.params);
    } catch (err) {
      log.error({ err, shardId, eventId: e.id, kind: e.kind }, 'predict auto resolve failed');
    }
    if (r) {
      const done = await d.db
        .transaction()
        .execute((tx) =>
          finalizeEvent(
            tx,
            e.id,
            { status: 'resolved', outcome: r.outcome, note: r.note, noteParams: r.noteParams },
            now,
          ),
        );
      if (done) resolved++;
    } else if (now.getTime() - e.resolve_at!.getTime() >= GIVE_UP_MS) {
      const done = await d.db
        .transaction()
        .execute((tx) =>
          finalizeEvent(
            tx,
            e.id,
            { status: 'void', outcome: null, note: '数据缺失, 自动作废', noteParams: { void: 'missing' } },
            now,
          ),
        );
      if (done) voided++;
    }
  }
  return { resolved, voided };
}
