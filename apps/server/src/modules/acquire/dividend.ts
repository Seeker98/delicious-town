import type { Transaction } from 'kysely';
import { DAY_MS, gameDay } from '@dt/shared';
import type { DB } from '../../db/schema';
import type { GameDeps } from '../../core/deps';
import { emitAction } from '../../core/action';
import { restLog, runSystemOp } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { isBanned } from '../admin/ban';
import type { T } from './rules';

type Log = { error(obj: object, msg: string): void };
const NO_LOG: Log = { error: () => {} };

/**
 * 哪些 (老板账号, 被收购店账号) 近 days 天的登录记录共用过设备或 IP：一条查询读出所有相关账号的登录记录，内存里比。
 * 收购时只在那一刻查一次；收购以后才在同一台设备、同一个网络上登录的小号，在这里把让渡退回店
 */
async function linkedPairs(
  db: GameDeps['db'],
  pairs: ReadonlyArray<readonly [number, number]>,
  days: number,
  now: Date,
): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = [...new Set(pairs.flat())];
  if (ids.length === 0) return out;
  const rows = await db
    .selectFrom('login_trace')
    .select(['account_id', 'ip', 'device_id'])
    .where('account_id', 'in', ids)
    .where('last_seen', '>=', new Date(now.getTime() - days * DAY_MS))
    .execute();
  const seen = new Map<number, Set<string>>();
  for (const r of rows) {
    const s = seen.get(r.account_id) ?? new Set<string>();
    s.add(`ip:${r.ip}`);
    if (r.device_id) s.add(`dev:${r.device_id}`);
    seen.set(r.account_id, s);
  }
  for (const [a, b] of pairs) {
    const sa = seen.get(a);
    const sb = seen.get(b);
    if (a === b || (sa && sb && [...sa].some((x) => sb.has(x)))) out.add(`${a}:${b}`);
  }
  return out;
}

interface Due {
  restId: number;
  day: string;
  ownerId: number;
}

/** 把这几行（还没发的）记成已发；refunded 是退回店。返回实际改到的行的合计和店 */
async function settleRows(
  tx: Transaction<DB>,
  rows: Due[],
  now: Date,
  refunded: boolean,
): Promise<{ coin: number; rests: Set<number> }> {
  const done = await tx
    .updateTable('acquire_due')
    .set({ paid_at: now, refunded })
    .where('paid_at', 'is', null)
    .where((eb) =>
      eb.or(
        rows.map((x) =>
          eb.and([eb('rest_id', '=', x.restId), eb('day', '=', x.day), eb('owner_rest_id', '=', x.ownerId)]),
        ),
      ),
    )
    .returning(['rest_id', 'coin'])
    .execute();
  return { coin: done.reduce((a, x) => a + Number(x.coin), 0), rests: new Set(done.map((x) => x.rest_id)) };
}

/**
 * 发让渡（收购改版 2026-10-16，原来的分红）：本区服今天以前还没发的 acquire_due，按记下时的老板合计发出去。
 * 老板被封、和店近 linkDays 天共用过设备或 IP 的，那几行退回店。钱是结算时从店里扣下的，这里不增发。
 * 退回每家店一个事务、发给每个老板一个事务，只改 paid_at 还是空的行：重跑不会重复发；某一个失败只记日志，下次补发
 */
export async function payDividends(
  d: GameDeps,
  shardId: number,
  now: Date,
  t: T,
  log: Log = NO_LOG,
): Promise<{
  owners: number;
  rests: number;
  coin: number;
  refunded: number;
  failed: number;
  failedOwners: number[];
  linked: number;
}> {
  const today = gameDay(now);
  const rows = await d.db
    .selectFrom('acquire_due as u')
    .innerJoin('restaurant as r', 'r.id', 'u.rest_id')
    .innerJoin('restaurant as o', 'o.id', 'u.owner_rest_id')
    .innerJoin('account as a', 'a.id', 'o.account_id')
    .select([
      'u.rest_id',
      'u.day',
      'u.owner_rest_id',
      'r.account_id as rest_account',
      'o.account_id as owner_account',
      'a.banned_at',
      'a.banned_until',
    ])
    .where('r.shard_id', '=', shardId)
    .where('u.paid_at', 'is', null)
    .where('u.day', '<', today)
    .orderBy('u.owner_rest_id')
    .orderBy('u.rest_id')
    .execute();
  const stats = {
    owners: 0,
    rests: 0,
    coin: 0,
    refunded: 0,
    failed: 0,
    failedOwners: [] as number[],
    linked: 0,
  };
  if (rows.length === 0) return stats;
  const links = await linkedPairs(
    d.db,
    rows.map((r) => [r.owner_account, r.rest_account] as const),
    t.linkDays,
    now,
  );
  const back = new Map<number, Due[]>();
  const pay = new Map<number, Due[]>();
  for (const r of rows) {
    const x: Due = { restId: r.rest_id, day: String(r.day), ownerId: r.owner_rest_id };
    const linked = links.has(`${r.owner_account}:${r.rest_account}`);
    if (linked) stats.linked += 1;
    const [m, k] = linked || isBanned(r, now) ? [back, x.restId] : [pay, x.ownerId];
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  for (const [restId, list] of back) {
    try {
      stats.refunded += await runSystemOp(
        d,
        shardId,
        restId,
        { source: 'acquire.refund', now },
        async (op) => {
          const done = await settleRows(op.tx, list, now, true);
          if (done.coin > 0) {
            gainCoin(op, done.coin, { source: 'acquire.refund' });
            restLog(op, 'acquire.refund', { coin: done.coin });
          }
          return done.coin;
        },
      );
    } catch (err) {
      log.error({ err, shardId, restId }, 'acquire refund failed');
      stats.failed += 1;
    }
  }
  for (const [ownerId, list] of pay) {
    try {
      const paid = await runSystemOp(d, shardId, ownerId, { source: 'acquire.dividend', now }, async (op) => {
        const done = await settleRows(op.tx, list, now, false);
        if (done.coin > 0) {
          gainCoin(op, done.coin, { source: 'acquire.dividend' });
          await op.tx
            .insertInto('acquire_holder')
            .values({ rest_id: ownerId, dividend_total: done.coin })
            .onConflict((oc) =>
              oc
                .column('rest_id')
                .doUpdateSet((eb) => ({
                  dividend_total: eb('acquire_holder.dividend_total', '+', done.coin),
                })),
            )
            .execute();
          restLog(op, 'acquire.dividend', { n: done.rests.size, coin: done.coin });
          // 支线“收购”（问题记录 515）：领到一次抽成
          await emitAction(op, 'acquire.dividend');
        }
        return { rests: done.rests.size, coin: done.coin };
      });
      stats.owners += 1;
      stats.rests += paid.rests;
      stats.coin += paid.coin;
    } catch (err) {
      log.error({ err, shardId, ownerId }, 'acquire dividend failed');
      stats.failed += 1;
      stats.failedOwners.push(ownerId);
    }
  }
  return stats;
}
