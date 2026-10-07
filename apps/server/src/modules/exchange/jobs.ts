import { addDays, gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { bookLock } from './service';
import { addCredit, creditWallets, newCredits } from './wallet';

const BATCH = 500;

/**
 * 过期（156-1 设计 §6.4）：剩余部分退回交易所账户，不锁店；一批最多 500 张。
 * 区服关掉的等级（exchange.closedLevels，问题记录 461）的单不等到期，一起下架
 */
export async function expireOrders(
  d: GameDeps,
  shardId: number,
  now: Date,
  closedLevels?: readonly number[],
): Promise<{ expired: number }> {
  const levels = closedLevels ?? (await d.shards.settings(shardId)).tuning.exchange.closedLevels;
  const closed = [...d.config.foods.values()].filter((f) => levels.includes(f.level)).map((f) => f.id);
  return d.db.transaction().execute(async (tx) => {
    const due = await tx
      .selectFrom('exchange_order')
      .select(['id', 'foods_id'])
      .where('shard_id', '=', shardId)
      .where('status', '=', 'open')
      .where((eb) =>
        closed.length > 0
          ? eb.or([eb('expires_at', '<=', now), eb('foods_id', 'in', closed)])
          : eb('expires_at', '<=', now),
      )
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

/** 系统收购的每日计数（exchange_maker_day）只读当天的，留 30 天备查，更早的删掉（backlog 156-3） */
export const MAKER_DAY_KEEP_DAYS = 30;

export async function pruneMakerDays(d: GameDeps, shardId: number, now: Date): Promise<{ deleted: number }> {
  const r = await d.db
    .deleteFrom('exchange_maker_day')
    .where('shard_id', '=', shardId)
    .where('day', '<', addDays(gameDay(now), -MAKER_DAY_KEEP_DAYS))
    .executeTakeFirst();
  return { deleted: Number(r.numDeletedRows) };
}

/** 过期每分钟一次、清理每个游戏日一次；挂在 restaurant 上，区服关掉交易所时也照常跑 */
export function exchangeJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'exchange-expire',
      feature: 'restaurant',
      period: (now) => now.toISOString().slice(0, 16),
      run: ({ shardId, now, settings }) =>
        expireOrders(d, shardId, now, settings.tuning.exchange.closedLevels),
    },
    {
      name: 'exchange-maker-day-prune',
      feature: 'restaurant',
      period: (now) => gameDay(now),
      run: ({ shardId, now }) => pruneMakerDays(d, shardId, now),
    },
  ];
}
