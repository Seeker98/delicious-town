import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { restLog, runSystemOp } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { addFoods } from '../cupboard/foods';
import { addCredit, creditWallets, newCredits } from '../exchange/wallet';

type Log = { error(obj: object, msg: string): void };
const NO_LOG: Log = { error: () => {} };

/** 一轮最多处理几张到期的单（多出的下一分钟接着处理） */
const BATCH = 500;

type Stats = { delivered: number; defaulted: number; refunded: number };

/**
 * 到期交割（期货设计 §6）：每家店一个事务（锁店），这家店到期的单按到期先后逐张处理：
 * 店里银币够付尾款就扣尾款、给食材（橱柜放不下的进交易所账户，不丢）；不够就违约（定金早已扣过）。
 * 配置里没有这种食材了（极端情况）就撤销、退定金。状态只从 open 改一次，重跑不会重复交割；
 * 某家店失败只记日志，下一分钟重试
 */
export async function deliverDue(
  d: GameDeps,
  shardId: number,
  now: Date,
  log: Log = NO_LOG,
): Promise<Stats & { failed: number }> {
  const due = await d.db
    .selectFrom('futures_contract')
    .select(['id', 'rest_id'])
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('due_at', '<=', now)
    .orderBy('rest_id')
    .orderBy('due_at')
    .orderBy('id')
    .limit(BATCH)
    .execute();
  const byRest = new Map<number, string[]>();
  for (const r of due) byRest.set(r.rest_id, [...(byRest.get(r.rest_id) ?? []), r.id]);
  const total = { delivered: 0, defaulted: 0, refunded: 0, failed: 0 };
  for (const [restId, ids] of byRest) {
    try {
      const s = await runSystemOp(d, shardId, restId, { source: 'futures', now }, async (op) => {
        const out: Stats = { delivered: 0, defaulted: 0, refunded: 0 };
        const rows = await op.tx
          .selectFrom('futures_contract')
          .selectAll()
          .where('id', 'in', ids)
          .where('status', '=', 'open')
          .orderBy('due_at')
          .orderBy('id')
          .forUpdate()
          .execute();
        const credits = newCredits();
        for (const r of rows) {
          const deposit = Number(r.deposit);
          const balance = Number(r.balance);
          const settle = (s: {
            status: 'delivered' | 'defaulted' | 'cancelled';
            to_cupboard?: number;
            to_wallet?: number;
          }) =>
            op.tx
              .updateTable('futures_contract')
              .set({ ...s, settled_at: now })
              .where('id', '=', r.id)
              .execute();
          if (!op.config.foods.get(r.foods_id)) {
            gainCoin(op, deposit, { source: 'futures.refund' });
            await settle({ status: 'cancelled' });
            restLog(op, 'futures.refunded', { foodsId: r.foods_id, qty: r.qty, deposit });
            out.refunded++;
          } else if (op.rest.coin >= balance) {
            spendCoin(op, balance, { source: 'futures.balance' });
            const plan = await addFoods(op, r.foods_id, r.qty, { source: 'futures', keepDropped: true });
            if (plan.dropped > 0) addCredit(credits, op.rest.id, 0, r.foods_id, plan.dropped);
            await settle({ status: 'delivered', to_cupboard: r.qty - plan.dropped, to_wallet: plan.dropped });
            restLog(op, 'futures.delivered', { foodsId: r.foods_id, qty: r.qty, toWallet: plan.dropped });
            out.delivered++;
          } else {
            await settle({ status: 'defaulted' });
            restLog(op, 'futures.defaulted', { foodsId: r.foods_id, qty: r.qty, deposit });
            out.defaulted++;
          }
        }
        await creditWallets(op.tx, credits);
        return out;
      });
      total.delivered += s.delivered;
      total.defaulted += s.defaulted;
      total.refunded += s.refunded;
    } catch (err) {
      log.error({ err, shardId, restId }, 'futures deliver failed');
      total.failed++;
    }
  }
  return total;
}

/** 每分钟一次；挂在 restaurant 上，区服关了期货也照常交割已有的单 */
export function futuresJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'futures-deliver',
      feature: 'restaurant',
      period: (now) => now.toISOString().slice(0, 16),
      run: ({ shardId, now, log }) => deliverDue(d, shardId, now, log),
    },
  ];
}
