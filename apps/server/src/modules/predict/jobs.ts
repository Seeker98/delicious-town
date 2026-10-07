import { gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { emitAction } from '../../core/action';
import { restLog, runSystemOp } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { createAutoEvents, resolveAutoEvents } from './auto';
import { payoutOf } from './service';

const BATCH = 200;

/** 截止（238-1 设计 §6.2）：到时间的 open 事件改为 closed */
export async function closeEvents(d: GameDeps, shardId: number, now: Date): Promise<{ closed: number }> {
  const r = await d.db
    .updateTable('predict_event')
    .set({ status: 'closed' })
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('close_at', '<=', now)
    .executeTakeFirst();
  return { closed: Number(r.numUpdatedRows) };
}

/** 一次结算的赚亏达到支线的门槛（问题记录 515）：到账 − 净投入 ≥ 5 万、15 万；净投入 − 到账 ≥ 3 万、15 万 */
export function settleQuestKeys(got: number, net: number): string[] {
  const keys: string[] = [];
  if (got - net >= 50_000) keys.push('predict.profit50k');
  if (got - net >= 150_000) keys.push('predict.profit150k');
  if (net - got >= 30_000) keys.push('predict.loss30k');
  if (net - got >= 150_000) keys.push('predict.loss150k');
  return keys;
}

/**
 * 结算（238-1 设计 §6.4）：已判定、已作废的事件，每个持仓单独一个事务（锁这家店），
 * 条件带 settled = false，重跑或并发也只发一次；不锁事件行（已是终态）。每次最多 200 个持仓
 */
export async function settleEvents(
  d: GameDeps,
  shardId: number,
  now: Date,
  log: { error(o: object, m: string): void } = { error: () => {} },
): Promise<{ settled: number; failed: number }> {
  const events = await d.db
    .selectFrom('predict_event')
    .select(['id', 'title', 'status', 'outcome', 'unit', 'void_ratio'])
    .where('shard_id', '=', shardId)
    .where('status', 'in', ['resolved', 'void'])
    .where('settled_at', 'is', null)
    .orderBy('id')
    .execute();
  let settled = 0;
  let failed = 0;
  for (const e of events) {
    if (settled >= BATCH) break;
    const todo = await d.db
      .selectFrom('predict_position')
      .select('rest_id')
      .where('event_id', '=', e.id)
      .where('settled', '=', false)
      .orderBy('rest_id')
      .limit(BATCH - settled)
      .execute();
    for (const { rest_id } of todo) {
      // 一个持仓出错只跳过它（留到下一轮重试），不卡住后面的（backlog 238-1）
      try {
        const done = await runSystemOp(d, shardId, rest_id, { source: 'predict.settle', now }, async (o) => {
          const p = await o.tx
            .updateTable('predict_position')
            .set({ settled: true })
            .where('event_id', '=', e.id)
            .where('rest_id', '=', rest_id)
            .where('settled', '=', false)
            .returning(['yes', 'no', 'net_cost'])
            .executeTakeFirst();
          if (!p) return false;
          const net = Number(p.net_cost);
          const got = payoutOf(e, { yes: p.yes, no: p.no, net_cost: net }) ?? 0;
          if (got > 0) gainCoin(o, got, { source: 'predict' });
          // 参与过的都写一条日志（押错的所得为 0），带净投入，能看出这一局的盈亏（问题记录 254）
          if (got > 0 || p.yes > 0 || p.no > 0 || net !== 0) {
            if (e.status === 'void') restLog(o, 'predict.refund', { title: e.title, coin: got, net });
            else restLog(o, 'predict.settle', { title: e.title, outcome: e.outcome, coin: got, net });
          }
          // 押中一方的结算到账（问题记录 318 支线"押中一次结算"）；作废退款不算
          if (e.status === 'resolved' && got > 0) await emitAction(o, 'predict.win');
          // 支线“事件预测”（问题记录 515）：一次结算赚、亏到某个数；作废退款不算
          if (e.status === 'resolved') for (const key of settleQuestKeys(got, net)) await emitAction(o, key);
          return true;
        });
        if (done) settled++;
      } catch (err) {
        failed++;
        log.error({ err, eventId: e.id, restId: rest_id }, 'predict settle failed');
      }
    }
    const left = await d.db
      .selectFrom('predict_position')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('event_id', '=', e.id)
      .where('settled', '=', false)
      .executeTakeFirstOrThrow();
    if (Number(left.n) === 0)
      await d.db
        .updateTable('predict_event')
        .set({ settled_at: now })
        .where('id', '=', e.id)
        .where('settled_at', 'is', null)
        .execute();
  }
  return { settled, failed };
}

/** 每分钟一次；挂在 restaurant 上，区服关掉事件合约时也照常截止、结算 */
export function predictJobs(d: GameDeps): PeriodicJob[] {
  const minute = (now: Date) => now.toISOString().slice(0, 16);
  return [
    {
      name: 'predict-close',
      feature: 'restaurant',
      period: minute,
      run: ({ shardId, now }) => closeEvents(d, shardId, now),
    },
    {
      name: 'predict-settle',
      feature: 'restaurant',
      period: minute,
      run: ({ shardId, now, log }) => settleEvents(d, shardId, now, log),
    },
    {
      name: 'predict-auto-create',
      feature: 'predict',
      period: (now) => gameDay(now),
      run: ({ shardId, now, log }) => createAutoEvents(d, shardId, now, d.rng(), log),
    },
    {
      name: 'predict-auto-resolve',
      feature: 'restaurant',
      period: minute,
      run: ({ shardId, now, log }) => resolveAutoEvents(d, shardId, now, log),
    },
  ];
}
