import { sql, type Kysely } from 'kysely';
import {
  addDays,
  ErrorCode,
  gameDay,
  gameParts,
  gameTime,
  type BucketDto,
  type DistributionDto,
  type EconomyRowDto,
  type SettlementRoundDto,
} from '@dt/shared';
import type { PeriodicJob } from '../../core/jobs';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';

/**
 * 不算"玩家操作"的流水来源（设计文档 裁定 10）：按前缀匹配，子来源一并排除
 * （settlement.cookfoods、mouse.trap、market.guess.bonus / refund、admin.grant）；另加结算自动加油 oil.auto
 */
export const SYSTEM_SOURCE_PREFIXES = ['settlement', 'mouse', 'market.guess', 'admin.'] as const;
export const SYSTEM_SOURCES_EXACT = ['oil.auto'] as const;

/** 一个区服一个游戏日（北京时间）的经济汇总：流水按 (kind, source)，结算收益记 source=settlement，外加活跃店数 */
export async function aggregateDay(db: Kysely<DB>, shardId: number, day: string): Promise<EconomyRowDto[]> {
  const start = gameTime(day, 0);
  const end = gameTime(addDays(day, 1), 0);
  const ledger = await db
    .selectFrom('ledger as l')
    .innerJoin('restaurant as r', 'r.id', 'l.rest_id')
    .select(['l.kind', 'l.source', sql<number>`sum(l.delta)::bigint`.as('amount')])
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where('l.created_at', '>=', start)
    .where('l.created_at', '<', end)
    .groupBy(['l.kind', 'l.source'])
    .execute();
  const income = await db
    .selectFrom('income_round as i')
    .innerJoin('restaurant as r', 'r.id', 'i.rest_id')
    .select([
      sql<number>`coalesce(sum(i.coin), 0)::bigint`.as('coin'),
      sql<number>`coalesce(sum(i.exp), 0)::bigint`.as('exp'),
    ])
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where('i.created_at', '>=', start)
    .where('i.created_at', '<', end)
    .executeTakeFirstOrThrow();
  const active = await db
    .selectFrom('ledger as l')
    .innerJoin('restaurant as r', 'r.id', 'l.rest_id')
    .select(sql<number>`count(distinct l.rest_id)`.as('n'))
    .where('r.shard_id', '=', shardId)
    .where('r.npc', '=', false)
    .where('l.created_at', '>=', start)
    .where('l.created_at', '<', end)
    .where((eb) =>
      eb.not(
        eb.or([
          ...SYSTEM_SOURCE_PREFIXES.map((p) => eb('l.source', 'like', `${p}%`)),
          eb('l.source', 'in', [...SYSTEM_SOURCES_EXACT]),
        ]),
      ),
    )
    .executeTakeFirstOrThrow();
  const rows = new Map<string, EconomyRowDto>();
  const add = (kind: string, source: string, amount: number) => {
    if (!amount) return;
    const key = `${kind}|${source}`;
    const cur = rows.get(key);
    if (cur) cur.amount += amount;
    else rows.set(key, { day, kind, source, amount });
  };
  for (const r of ledger) add(r.kind, r.source, Number(r.amount));
  add('coin', 'settlement', Number(income.coin));
  add('exp', 'settlement', Number(income.exp));
  add('active', 'rest', Number(active.n));
  return [...rows.values()];
}

/** 把一天的汇总写进 stat_daily（先删后写，重复执行结果不变） */
export async function rollupDay(db: Kysely<DB>, shardId: number, day: string): Promise<number> {
  const rows = await aggregateDay(db, shardId, day);
  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom('stat_daily').where('shard_id', '=', shardId).where('day', '=', day).execute();
    if (rows.length > 0)
      await tx
        .insertInto('stat_daily')
        .values(
          rows.map((r) => ({ shard_id: shardId, day, kind: r.kind, source: r.source, amount: r.amount })),
        )
        .execute();
  });
  return rows.length;
}

/** 每天 00:10（北京时间）之后汇总前一天（设计文档 裁定 9） */
export function statDailyJob(db: Kysely<DB>): PeriodicJob {
  return {
    name: 'stat-daily',
    feature: 'restaurant',
    period: (now) => {
      const p = gameParts(now);
      if (p.hour === 0 && p.minute < 10) return null;
      return addDays(p.day, -1);
    },
    run: async ({ shardId, period }) => ({ rows: await rollupDay(db, shardId, period) }),
  };
}

const DAY_MS = 86_400_000;

/** 经济：已汇总的历史 + 今天（和还没汇总的昨天）实时算 */
export async function economy(
  db: Kysely<DB>,
  shardId: number,
  from: string,
  to: string,
  now: Date,
): Promise<EconomyRowDto[]> {
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  if (span < 0 || span > 89)
    throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: [{ path: 'to', message: 'range' }] });
  const today = gameDay(now);
  const stored = await db
    .selectFrom('stat_daily')
    .select(['day', 'kind', 'source', 'amount'])
    .where('shard_id', '=', shardId)
    .where('day', '>=', from)
    .where('day', '<=', to)
    .orderBy('day')
    .execute();
  const rows: EconomyRowDto[] = stored
    .filter((r) => r.day !== today)
    .map((r) => ({ ...r, amount: Number(r.amount) }));
  const storedDays = new Set(rows.map((r) => r.day));
  for (const d of [addDays(today, -1), today]) {
    if (d < from || d > to || (d !== today && storedDays.has(d))) continue;
    rows.push(...(await aggregateDay(db, shardId, d)));
  }
  return rows;
}

function buckets(rows: Array<{ b: number; n: number }>, width: number, minFrom: number): BucketDto[] {
  return rows
    .map((r) => ({ from: Math.max(minFrom, r.b * width), to: r.b * width + width - 1, count: Number(r.n) }))
    .sort((a, b) => a.from - b.from);
}

export async function distribution(db: Kysely<DB>, shardId: number): Promise<DistributionDto> {
  const base = db.selectFrom('restaurant').where('shard_id', '=', shardId).where('npc', '=', false);
  const states = await base
    .select(['state', sql<number>`count(*)`.as('n')])
    .groupBy('state')
    .execute();
  const levels = await base
    .select([sql<number>`floor(level / 10)::int`.as('b'), sql<number>`count(*)`.as('n')])
    .groupBy('b')
    .execute();
  const stars = await base
    .select(['star_level', sql<number>`count(*)`.as('n')])
    .groupBy('star_level')
    .orderBy('star_level')
    .execute();
  const cookbooks = await base
    .select([
      sql<number>`floor(coalesce((cookbook_counts->>'learned')::int, 0) / 20)::int`.as('b'),
      sql<number>`count(*)`.as('n'),
    ])
    .groupBy('b')
    .execute();
  const count = (s: number) => Number(states.find((x) => x.state === s)?.n ?? 0);
  return {
    open: count(1),
    closed: count(2),
    levels: buckets(levels, 10, 1),
    stars: stars.map((s) => ({ star: s.star_level, count: Number(s.n) })),
    cookbooks: buckets(cookbooks, 20, 0),
  };
}

export async function settlementRounds(
  db: Kysely<DB>,
  shardId: number,
  rounds: number,
): Promise<SettlementRoundDto[]> {
  const rows = await db
    .selectFrom('job_run')
    .select(['period', 'started_at', 'stats'])
    .where('shard_id', '=', shardId)
    .where('job', '=', 'settlement')
    .where('finished_at', 'is not', null)
    .orderBy('started_at', 'desc')
    .limit(rounds)
    .execute();
  return rows.reverse().map((r) => {
    const s = r.stats as Record<string, number>;
    return {
      round: Number(r.period),
      at: r.started_at.toISOString(),
      ms: s.ms ?? 0,
      settled: s.settled ?? 0,
      closed: s.closed ?? 0,
      failed: s.failed ?? 0,
    };
  });
}
