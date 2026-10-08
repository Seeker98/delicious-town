import { sql } from 'kysely';
import { addDays, gameDay, gameParts } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { payDividends } from './dividend';
import { aggregateIncomeDay, INCOME_KEEP_DAYS, pruneIncomeDays } from './income';
import { basePrice, windowDays, type T } from './rules';
import { firstIncomeDay, priceWindow } from './state';

/** 交易、拦截、分红、打理记录留几天（设计 §3.1；同一对店 7 天、每天 3 次只看最近的，页面只看昨天的分红） */
const LOG_KEEP_DAYS = 30;
/** 基础身价一次写多少家（每家 4 个参数，远低于参数个数上限） */
const UPSERT_CHUNK = 1000;
const DAY_MS = 86_400_000;

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
): Promise<{ income: number; bases: number; decayed: number; unlisted: number }> {
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
        part.map((r) => ({
          rest_id: r.id,
          shard_id: shardId,
          base: basePrice(Number(r.coin), t, days),
          heat: 1,
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
  for (const table of ['acquire_dividend', 'acquire_tend'] as const)
    await d.db.deleteFrom(table).where('day', '<', cutoffDay).where('rest_id', 'in', shardRests).execute();
  return {
    income,
    bases: rows.length,
    decayed: Number(decayed.numAffectedRows ?? 0),
    unlisted: Number(un.numUpdatedRows),
  };
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
      run: async ({ shardId, now, settings }) => runAcquireDay(d, shardId, now, settings.tuning.acquire),
    },
    {
      // 排在 acquire-day 后面：前一天的收入已经汇总好。没汇总好时会失败，10 分钟后再试
      // （稳健性批：原来不重试，收购“我的”整天写“昨天的分红还没发”）
      name: 'acquire-dividend',
      feature: 'acquire',
      retry: true,
      period: (now) => {
        const day = after0005(now);
        return day === null ? null : `acquire-dividend-${day}`;
      },
      run: async ({ shardId, now, settings, log }) =>
        payDividends(d, shardId, now, settings.tuning.acquire, log),
    },
  ];
}
