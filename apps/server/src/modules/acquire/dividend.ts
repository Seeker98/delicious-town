import { addDays, gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { restLog, runSystemOp } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { isBanned } from '../admin/ban';
import { incomeSums } from './income';
import { capDividends, dividendCap, dividendOf, type T } from './rules';
import { priceWindow } from './state';

type Log = { error(obj: object, msg: string): void };
const NO_LOG: Log = { error: () => {} };

interface Pending {
  restId: number;
  coin: number;
  tended: boolean;
}

/**
 * 发前一天的分红（收购 PR 2）：本区服每家被收购的店给现在的老板发 前一天结算 × 5%（那天打理过 × 1.5），
 * 不满 minRounds 轮的不发；每个老板的合计按自己近 priceDays 天的日均收入封顶，超了按比例压。
 * 老板被封不发。每个老板一个事务：某个老板失败只记日志，不影响别人。
 * 分红记录主键 (rest_id, day)，只给这次新写进去的发钱，同一天重跑不会重复发
 */
export async function payDividends(
  d: GameDeps,
  shardId: number,
  now: Date,
  t: T,
  log: Log = NO_LOG,
): Promise<{ owners: number; rests: number; coin: number; failed: number }> {
  const today = gameDay(now);
  const day = addDays(today, -1);
  const rows = await d.db
    .selectFrom('acquire_state as s')
    .innerJoin('restaurant as o', 'o.id', 's.owner_rest_id')
    .innerJoin('account as a', 'a.id', 'o.account_id')
    .leftJoin('rest_income_day as i', (j) => j.onRef('i.rest_id', '=', 's.rest_id').on('i.day', '=', day))
    .leftJoin('acquire_tend as td', (j) => j.onRef('td.rest_id', '=', 's.rest_id').on('td.day', '=', day))
    .select([
      's.rest_id',
      's.owner_rest_id',
      'a.banned_at',
      'a.banned_until',
      'i.coin',
      'i.rounds',
      'td.rest_id as tended',
    ])
    .where('s.shard_id', '=', shardId)
    .where('s.owner_rest_id', 'is not', null)
    .orderBy('s.owner_rest_id')
    .orderBy('s.rest_id')
    .execute();
  const byOwner = new Map<number, Pending[]>();
  for (const r of rows) {
    if (isBanned(r, now)) continue;
    const tended = r.tended !== null;
    const coin = dividendOf(Number(r.coin ?? 0), r.rounds ?? 0, tended, t);
    if (coin === null) continue;
    const list = byOwner.get(r.owner_rest_id!) ?? [];
    list.push({ restId: r.rest_id, coin, tended });
    byOwner.set(r.owner_rest_id!, list);
  }
  const w = priceWindow(today, t);
  const ownerIncome = await incomeSums(d.db, [...byOwner.keys()], w.from, w.to);
  const stats = { owners: 0, rests: 0, coin: 0, failed: 0 };
  for (const [ownerId, list] of byOwner) {
    const capped = capDividends(
      list.map((x) => x.coin),
      dividendCap(ownerIncome.get(ownerId) ?? 0, t),
    );
    try {
      const paid = await runSystemOp(d, shardId, ownerId, { source: 'acquire.dividend', now }, async (op) => {
        const inserted = await op.tx
          .insertInto('acquire_dividend')
          .values(
            list.map((x, i) => ({
              rest_id: x.restId,
              day,
              owner_rest_id: ownerId,
              coin: capped[i]!,
              tended: x.tended,
            })),
          )
          .onConflict((oc) => oc.columns(['rest_id', 'day']).doNothing())
          .returning(['rest_id', 'coin'])
          .execute();
        const total = inserted.reduce((a, x) => a + Number(x.coin), 0);
        if (total > 0) {
          gainCoin(op, total, { source: 'acquire.dividend' });
          await op.tx
            .insertInto('acquire_holder')
            .values({ rest_id: ownerId, dividend_total: total })
            .onConflict((oc) =>
              oc
                .column('rest_id')
                .doUpdateSet((eb) => ({ dividend_total: eb('acquire_holder.dividend_total', '+', total) })),
            )
            .execute();
          restLog(op, 'acquire.dividend', { day, n: inserted.length, coin: total });
        }
        return { rests: inserted.length, coin: total };
      });
      stats.owners += 1;
      stats.rests += paid.rests;
      stats.coin += paid.coin;
    } catch (err) {
      log.error({ err, shardId, ownerId, day }, 'acquire dividend failed');
      stats.failed += 1;
    }
  }
  return stats;
}
