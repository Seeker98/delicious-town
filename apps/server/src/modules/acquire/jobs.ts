import { sql } from 'kysely';
import { addDays, DAY_MS, gameDay, gameParts } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { JobError, type JobContext, type PeriodicJob } from '../../core/jobs';
import { payDividends } from './dividend';
import { aggregateIncomeDay, INCOME_KEEP_DAYS, pruneIncomeDays } from './income';
import { createOp, flushOp, restLog } from '../../core/op';
import { withRestaurants } from '../../db/tx';
import { basePrice, cedeState, windowDays, type T } from './rules';
import { firstIncomeDay, priceWindow } from './state';

/** 交易、拦截、让渡、打理记录留几天（设计 §3.1；同一对店 7 天只看最近的，页面看近 30 天的让渡） */
const LOG_KEEP_DAYS = 30;
/** 基础身价一次写多少家（每家 4 个参数，远低于参数个数上限） */
const UPSERT_CHUNK = 1000;

/** 游戏时间 00:05 以后才跑（前一天最后一轮结算已经写完）；返回当天的游戏日 */
function after0005(now: Date): string | null {
  const p = gameParts(now);
  return p.hour === 0 && p.minute < 5 ? null : gameDay(now);
}

/**
 * 汇总前两天的收入（收购 PR 1 审查：周期任务出错不重试，某天没汇总上、或最后一轮结算晚写进来时，下一天补上；
 * income_round 留 3 天，汇总是覆盖写，重复跑没关系）
 */
async function aggregateRecent(d: GameDeps, shardId: number, today: string): Promise<number> {
  let n = 0;
  for (const back of [2, 1]) n += await aggregateIncomeDay(d.db, shardId, addDays(today, -back));
  return n;
}

/**
 * 每天一次（收购 PR 1）：汇总前两天收入 → 重算基础身价（2 星以上、或已经有行的店）→ 热度回落 → 清掉到期挂牌
 * → 清掉 30 天前的交易、拦截、分红、打理记录。热度回落是一条原子语句，不会盖掉同时发生的强收；靠周期键保证一天一次
 */
export async function runAcquireDay(
  d: GameDeps,
  shardId: number,
  now: Date,
  t: T,
  log: JobContext['log'] = { error: () => {} },
): Promise<{
  income: number;
  bases: number;
  released: number;
  releaseFailed: number;
  decayed: number;
  unlisted: number;
}> {
  const today = gameDay(now);
  const income = await aggregateRecent(d, shardId, today);
  const w = priceWindow(today, t);
  const days = windowDays(w, await firstIncomeDay(d.db), t);
  // 本区服要算身价的店和它们近几天的收入合计：一条查询，不用把店号列表传来传去
  const rows = await d.db
    .selectFrom('restaurant as r')
    .leftJoin('acquire_state as s', 's.rest_id', 'r.id')
    .leftJoin('rest_income_day as i', (j) =>
      j.onRef('i.rest_id', '=', 'r.id').on('i.day', '>=', w.from).on('i.day', '<', w.to),
    )
    .select(['r.id', (eb) => eb.fn.coalesce(eb.fn.sum<number>('i.coin'), sql<number>`0`).as('coin')])
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where((eb) => eb.or([eb('r.star_level', '>=', t.minStar), eb('s.rest_id', 'is not', null)]))
    .groupBy('r.id')
    .execute();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const part = rows.slice(i, i + UPSERT_CHUNK);
    await d.db
      .insertInto('acquire_state')
      .values(
        // 新建的行就是刚到 minStar 星的店：newStarProtectDays 天内不能被强收（收购改版 2026-10-16）
        part.map((r) => ({
          rest_id: r.id,
          shard_id: shardId,
          base: basePrice(Number(r.coin), t, days),
          heat: 1,
          protected_until: new Date(now.getTime() + t.newStarProtectDays * DAY_MS),
        })),
      )
      .onConflict((oc) => oc.column('rest_id').doUpdateSet({ base: (eb) => eb.ref('excluded.base') }))
      .execute();
  }
  // 和 rules.decayHeat 一样：1 + (热度 − 1) × (1 − heatDecay)，保留 3 位，不低于 1
  const decayed = await sql`
    update acquire_state
    set heat = greatest(1, round((1 + (heat - 1) * ${1 - t.heatDecay})::numeric, 3))
    where shard_id = ${shardId} and heat > 1`.execute(d.db);
  const un = await d.db
    .updateTable('acquire_state')
    .set({ list_rate: null, list_until: null })
    .where('shard_id', '=', shardId)
    .where('list_until', '<=', now)
    .executeTakeFirst();
  const cutoff = new Date(now.getTime() - LOG_KEEP_DAYS * DAY_MS);
  await d.db
    .deleteFrom('acquire_log')
    .where('shard_id', '=', shardId)
    .where('created_at', '<', cutoff)
    .execute();
  await d.db
    .deleteFrom('acquire_block')
    .where('shard_id', '=', shardId)
    .where('created_at', '<', cutoff)
    .execute();
  const cutoffDay = addDays(today, -LOG_KEEP_DAYS);
  const shardRests = d.db.selectFrom('restaurant').select('id').where('shard_id', '=', shardId);
  for (const table of ['acquire_due', 'acquire_tend'] as const)
    await d.db.deleteFrom(table).where('day', '<', cutoffDay).where('rest_id', 'in', shardRests).execute();
  const release = await autoRelease(d, shardId, now, t, log);
  return {
    income,
    bases: rows.length,
    released: release.released,
    releaseFailed: release.failed,
    decayed: Number(decayed.numAffectedRows ?? 0),
    unlisted: Number(un.numUpdatedRows),
  };
}

/**
 * 老板 tendReleaseDays 天没打理的店自动放手（收购改版 2026-10-16）：每家一个事务，锁住老板和店再确认一次（期间可能刚打理、换了老板）。
 * 和手动放手一样不退钱、热度不变、没有保护期；两边都写动态
 */
async function autoRelease(
  d: GameDeps,
  shardId: number,
  now: Date,
  t: T,
  log: JobContext['log'],
): Promise<{ released: number; failed: number }> {
  const today = gameDay(now);
  const owned = await d.db
    .selectFrom('acquire_state')
    .select(['rest_id', 'owner_rest_id', 'tended_at', 'acquired_at'])
    .where('shard_id', '=', shardId)
    .where('owner_rest_id', 'is not', null)
    .execute();
  const stale = owned.filter((s) => cedeState(s, today, t).idleDays >= t.tendReleaseDays);
  if (stale.length === 0) return { released: 0, failed: 0 };
  const settings = await d.shards.settings(shardId);
  let n = 0;
  let failed = 0;
  for (const x of stale) {
    const ownerId = x.owner_rest_id!;
    // 一家出错只记日志，别的店照常放手；这家明天再放（整个任务不重试：热度衰减不能重跑）
    try {
      await withRestaurants(d.db, [x.rest_id, ownerId], async (tx, rests) => {
        const s = await tx
          .selectFrom('acquire_state')
          .select(['owner_rest_id', 'tended_at', 'acquired_at', 'heat'])
          .where('rest_id', '=', x.rest_id)
          .forUpdate()
          .executeTakeFirst();
        if (!s || s.owner_rest_id !== ownerId || cedeState(s, today, t).idleDays < t.tendReleaseDays) return;
        const owner = createOp(d, tx, rests.get(ownerId)!, settings, { source: 'acquire.release', now });
        const store = createOp(d, tx, rests.get(x.rest_id)!, settings, { source: 'acquire.release', now });
        await tx
          .updateTable('acquire_state')
          .set({ owner_rest_id: null, list_rate: null, list_until: null, acquired_at: null, tended_at: null })
          .where('rest_id', '=', x.rest_id)
          .execute();
        await tx
          .insertInto('acquire_log')
          .values({
            shard_id: shardId,
            kind: 'release',
            buyer_rest_id: null,
            target_rest_id: x.rest_id,
            seller_rest_id: ownerId,
            price: 0,
            tax: 0,
            heat_after: s.heat,
            created_at: now,
          })
          .execute();
        restLog(owner, 'acquire.autoReleased', {
          restId: x.rest_id,
          name: store.rest.name,
          days: t.tendReleaseDays,
        });
        restLog(store, 'acquire.autoFreed', { byName: owner.rest.name, days: t.tendReleaseDays });
        await flushOp(owner);
        await flushOp(store);
        n += 1;
      });
    } catch (err) {
      log.error({ err, shardId, restId: x.rest_id }, 'acquire auto release failed');
      failed += 1;
    }
  }
  return { released: n, failed };
}

export function acquireJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      // 收入汇总挂在结算上：收购关着也照常攒，开的时候身价就有 7 天的数
      name: 'income-day',
      feature: 'settlement',
      period: (now) => {
        const day = after0005(now);
        return day === null ? null : `income-day-${day}`;
      },
      run: async ({ shardId, now }) => {
        const today = gameDay(now);
        const income = await aggregateRecent(d, shardId, today);
        const pruned = await pruneIncomeDays(d.db, shardId, addDays(today, -1 - INCOME_KEEP_DAYS));
        return { income, pruned };
      },
    },
    {
      name: 'acquire-day',
      feature: 'acquire',
      period: (now) => {
        const day = after0005(now);
        return day === null ? null : `acquire-day-${day}`;
      },
      run: async ({ shardId, now, settings, log }) =>
        runAcquireDay(d, shardId, now, settings.tuning.acquire, log),
    },
    {
      // 发前一天结算时扣下的让渡（收购改版 2026-10-16）。出错 10 分钟后再试
      // （稳健性批：原来不重试，收购“我的”整天写“昨天的分红还没发”）；
      // 有老板、有店没发成也算出错，重试时只改还没发的行（稳健性收尾批）
      name: 'acquire-dividend',
      feature: 'acquire',
      retry: true,
      period: (now) => {
        const day = after0005(now);
        return day === null ? null : `acquire-dividend-${day}`;
      },
      run: async ({ shardId, now, settings, log }) => {
        const stats = await payDividends(d, shardId, now, settings.tuning.acquire, log);
        if (stats.failed > 0) throw new JobError(`acquire dividend: ${stats.failed} failed`, stats);
        return stats;
      },
    },
  ];
}
