import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { bookLock } from './service';
import { addCredit, creditWallets, newCredits } from './wallet';

const BATCH = 500;

/** 过期（156-1 设计 §6.4）：剩余部分退回交易所账户，不锁店；一批最多 500 张 */
export async function expireOrders(d: GameDeps, shardId: number, now: Date): Promise<{ expired: number }> {
  return d.db.transaction().execute(async (tx) => {
    const due = await tx
      .selectFrom('exchange_order')
      .select(['id', 'foods_id'])
      .where('shard_id', '=', shardId)
      .where('status', '=', 'open')
      .where('expires_at', '<=', now)
      .orderBy('foods_id')
      .orderBy('id')
      .limit(BATCH)
      .execute();
    const credits = newCredits();
    let n = 0;
    for (const foodsId of [...new Set(due.map((x) => x.foods_id))]) {
      await bookLock(tx, shardId, foodsId);
      const rows = await tx
        .updateTable('exchange_order')
        .set({ status: 'expired', closed_at: now })
        .where(
          'id',
          'in',
          due.filter((x) => x.foods_id === foodsId).map((x) => x.id),
        )
        .where('status', '=', 'open')
        .returning(['rest_id', 'side', 'foods_id', 'price', 'qty', 'filled'])
        .execute();
      for (const r of rows) {
        const left = r.qty - r.filled;
        if (r.side === 'buy') addCredit(credits, r.rest_id, r.price * left);
        else addCredit(credits, r.rest_id, 0, r.foods_id, left);
        await tx
          .insertInto('rest_log')
          .values({
            rest_id: r.rest_id,
            type: 'exchange.expire',
            params: JSON.stringify({ side: r.side, foodsId: r.foods_id, price: r.price, left }),
            created_at: now,
          })
          .execute();
        n++;
      }
    }
    await creditWallets(tx, credits);
    return { expired: n };
  });
}

/** 每分钟一次；挂在 restaurant 上，区服关掉交易所时也照常退回 */
export function exchangeJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'exchange-expire',
      feature: 'restaurant',
      period: (now) => now.toISOString().slice(0, 16),
      run: ({ shardId, now }) => expireOrders(d, shardId, now),
    },
  ];
}
