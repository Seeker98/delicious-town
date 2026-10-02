import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { restLog, runSystemOp } from '../../core/op';
import { gainCoin } from '../../core/resources';
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

/**
 * 结算（238-1 设计 §6.4）：已判定、已作废的事件，每个持仓单独一个事务（锁这家店），
 * 条件带 settled = false，重跑或并发也只发一次；不锁事件行（已是终态）。每次最多 200 个持仓
 */
export async function settleEvents(d: GameDeps, shardId: number, now: Date): Promise<{ settled: number }> {
  const events = await d.db
    .selectFrom('predict_event')
    .select(['id', 'title', 'status', 'outcome', 'unit'])
    .where('shard_id', '=', shardId)
    .where('status', 'in', ['resolved', 'void'])
    .where('settled_at', 'is', null)
    .orderBy('id')
    .execute();
  let settled = 0;
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
        const got = payoutOf(e, { yes: p.yes, no: p.no, net_cost: Number(p.net_cost) }) ?? 0;
        if (got > 0) {
          gainCoin(o, got, { source: 'predict' });
          if (e.status === 'void') restLog(o, 'predict.refund', { title: e.title, coin: got });
          else restLog(o, 'predict.settle', { title: e.title, outcome: e.outcome, coin: got });
        }
        return true;
      });
      if (done) settled++;
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
  return { settled };
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
      run: ({ shardId, now }) => settleEvents(d, shardId, now),
    },
  ];
}
