import { addDays, gameDay } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { emitAction } from '../../core/action';
import { restLog, runSystemOp } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { isBanned } from '../admin/ban';
import { aggregateIncomeDay, incomeSums } from './income';
import { capDividends, dividendCap, dividendOf, windowDays, type T } from './rules';
import { firstIncomeDay, priceWindow } from './state';

type Log = { error(obj: object, msg: string): void };
const NO_LOG: Log = { error: () => {} };

const DAY_MS = 86_400_000;

/**
 * 哪些 (老板账号, 被收购店账号) 近 days 天的登录记录共用过设备或 IP：一条查询读出所有相关账号的登录记录，内存里比。
 * 收购时只在那一刻查一次；收购以后才在同一台设备、同一个网络上登录的小号，在这里挡下分红
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

interface Pending {
  restId: number;
  coin: number;
  tended: boolean;
}

/**
 * 发前一天的分红（收购 PR 2）：本区服每家被收购的店给现在的老板发 前一天结算 × 5%（那天打理过 × 1.5），
 * 不满 minRounds 轮的不发；每个老板的合计按自己近 priceDays 天的日均收入封顶，超了按比例压。
 * 老板被封不发；老板和被收购的店近 linkDays 天共用过设备或 IP 的，这家不发。每个老板一个事务：某个老板失败只记日志，不影响别人。
 * 分红记录主键 (rest_id, day)，只给还没发过的店发钱，同一天重跑不会重复发；已经发给这个老板的从封顶里扣掉。
 * 前一天的收入没汇总时先补汇总；补完还是一行都没有（那天没有结算记录）时报错（任务记录里留下错误），不按 0 发
 */
/** 这一天本区服的收入汇总过没有（有一行就算） */
async function summedDay(d: GameDeps, shardId: number, day: string): Promise<boolean> {
  const r = await d.db
    .selectFrom('rest_income_day')
    .select('rest_id')
    .where('day', '=', day)
    .where('rest_id', 'in', d.db.selectFrom('restaurant').select('id').where('shard_id', '=', shardId))
    .limit(1)
    .executeTakeFirst();
  return !!r;
}

export async function payDividends(
  d: GameDeps,
  shardId: number,
  now: Date,
  t: T,
  log: Log = NO_LOG,
): Promise<{ owners: number; rests: number; coin: number; failed: number; linked: number }> {
  const today = gameDay(now);
  const day = addDays(today, -1);
  // 前一天的收入还没汇总（汇总任务那天没跑成，它不重试）：先补一次再发（稳健性批终审 I1：原来直接报错，
  // 这一天的分红就没了）。汇总是覆盖写、单日最高取较大，重复做没有影响；结算记录留 3 天，前一天的还在
  if (!(await summedDay(d, shardId, day))) await aggregateIncomeDay(d.db, shardId, day);
  const rows = await d.db
    .selectFrom('acquire_state as s')
    .innerJoin('restaurant as o', 'o.id', 's.owner_rest_id')
    .innerJoin('account as a', 'a.id', 'o.account_id')
    .innerJoin('restaurant as r', 'r.id', 's.rest_id')
    .leftJoin('rest_income_day as i', (j) => j.onRef('i.rest_id', '=', 's.rest_id').on('i.day', '=', day))
    .leftJoin('acquire_tend as td', (j) => j.onRef('td.rest_id', '=', 's.rest_id').on('td.day', '=', day))
    .select([
      's.rest_id',
      's.owner_rest_id',
      'o.account_id as owner_account',
      'r.account_id as rest_account',
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
  if (rows.length === 0) return { owners: 0, rests: 0, coin: 0, failed: 0, linked: 0 };
  if (!(await summedDay(d, shardId, day))) throw new Error(`acquire dividend: no income summary for ${day}`);
  const live = rows.filter((r) => !isBanned(r, now));
  const links = await linkedPairs(
    d.db,
    live.map((r) => [r.owner_account, r.rest_account] as const),
    t.linkDays,
    now,
  );
  let linked = 0;
  const byOwner = new Map<number, Pending[]>();
  for (const r of live) {
    if (links.has(`${r.owner_account}:${r.rest_account}`)) {
      linked += 1;
      continue;
    }
    const tended = r.tended !== null;
    const coin = dividendOf(Number(r.coin ?? 0), r.rounds ?? 0, tended, t);
    if (coin === null) continue;
    const list = byOwner.get(r.owner_rest_id!) ?? [];
    list.push({ restId: r.rest_id, coin, tended });
    byOwner.set(r.owner_rest_id!, list);
  }
  const w = priceWindow(today, t);
  const days = windowDays(w, await firstIncomeDay(d.db), t);
  const ownerIncome = await incomeSums(d.db, [...byOwner.keys()], w.from, w.to);
  const stats = { owners: 0, rests: 0, coin: 0, failed: 0, linked };
  for (const [ownerId, list] of byOwner) {
    const cap = dividendCap(ownerIncome.get(ownerId) ?? 0, t, days);
    try {
      const paid = await runSystemOp(d, shardId, ownerId, { source: 'acquire.dividend', now }, async (op) => {
        // 锁着老板的店（分红只有这个任务写）：已经发过的店不再算，已经发给这个老板的从封顶里扣掉
        const done = await op.tx
          .selectFrom('acquire_dividend')
          .select(['rest_id', 'owner_rest_id', 'coin'])
          .where('day', '=', day)
          .where((eb) =>
            eb.or([
              eb('owner_rest_id', '=', ownerId),
              eb(
                'rest_id',
                'in',
                list.map((x) => x.restId),
              ),
            ]),
          )
          .execute();
        const doneIds = new Set(done.map((x) => x.rest_id));
        const todo = list.filter((x) => !doneIds.has(x.restId));
        if (todo.length === 0) return { rests: 0, coin: 0 };
        const paidBefore = done
          .filter((x) => x.owner_rest_id === ownerId)
          .reduce((a, x) => a + Number(x.coin), 0);
        const capped = capDividends(
          todo.map((x) => x.coin),
          Math.max(0, cap - paidBefore),
        );
        const inserted = await op.tx
          .insertInto('acquire_dividend')
          .values(
            todo.map((x, i) => ({
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
          // 支线“收购”（问题记录 515）：领到一次分红
          await emitAction(op, 'acquire.dividend');
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
