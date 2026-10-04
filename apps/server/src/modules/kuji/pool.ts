import { sql, type Kysely } from 'kysely';
import type { Tuning } from '@dt/config';
import { gameDay, type KujiLine } from '@dt/shared';
import type { DB } from '../../db/schema';

type Tiers = Tuning['kuji']['tiers'];
type Last = Tuning['kuji']['last'];

/** 一池的奖品配置：档位、各档奖品、最后赏 */
export interface Prizes {
  tiers: Tiers;
  last: Last;
}

export interface PoolRow {
  id: string;
  shard_id: number;
  day: string;
  seq: number;
  status: 'open' | 'sold_out' | 'expired';
  total: number;
  last_rest_id: number | null;
  /** 开池时的奖品快照；终审前开的池没有（为空），按当前配置 */
  tiers: unknown;
  last: unknown;
  /** 月度主题（问题记录 274） */
  theme: number | null;
  /** 奖池线（240-2） */
  line: KujiLine;
}

/** 这一池的奖品：有快照用快照，没有用当前配置（一番赏终审 I1：改区服数值只影响下一池） */
export function prizesOf(pool: PoolRow, current: Prizes): Prizes {
  return pool.tiers && pool.last ? { tiers: pool.tiers as Tiers, last: pool.last as Last } : current;
}

const COLS = [
  'id',
  'shard_id',
  'day',
  'seq',
  'status',
  'total',
  'last_rest_id',
  'tiers',
  'last',
  'theme',
  'line',
] as const;

/** 开一池：按 tiers 生成签（各档连续编号，抽签时随机取，所以顺序无所谓）；唯一冲突（别人同时开了）返回 null */
export async function openPool(
  tx: Kysely<DB>,
  shardId: number,
  day: string,
  seq: number,
  tiers: Tiers,
  now: Date,
  last?: Last,
  theme?: number,
  line: KujiLine = 'normal',
): Promise<PoolRow | null> {
  const total = tiers.reduce((s, x) => s + x.count, 0);
  const p = (await tx
    .insertInto('kuji_pool')
    .values({
      shard_id: shardId,
      day,
      seq,
      status: 'open',
      total,
      created_at: now,
      tiers: last ? JSON.stringify(tiers) : null,
      last: last ? JSON.stringify(last) : null,
      theme: theme ?? null,
      line,
    })
    .onConflict((oc) => oc.columns(['shard_id', 'line', 'day', 'seq']).doNothing())
    .returning(COLS)
    .executeTakeFirst()) as PoolRow | undefined;
  if (!p) return null;
  const rows: Array<{ pool_id: string; idx: number; tier: string }> = [];
  for (const tier of tiers)
    for (let i = 0; i < tier.count; i++) rows.push({ pool_id: p.id, idx: rows.length, tier: tier.key });
  await tx.insertInto('kuji_ticket').values(rows).execute();
  return p;
}

/**
 * 当前池（一番赏设计 §5.2）：先把前几天没抽完的池改成过期；今天有进行中的就返回，
 * 没有就开下一池（seq = 今天最大 + 1）。
 * 同一区服的开池、过期串行处理（事务级咨询锁，事务结束释放）：不然别人的事务正好在"查进行中的池"
 * 和"查最大池号"之间提交，会多开出一个池号 +1 的池，出现两个进行中的池（终审前压力测试发现）。
 * 加锁顺序：店 → 这把锁 → 池行。唯一索引仍兜底
 */
export async function currentPool(
  tx: Kysely<DB>,
  shardId: number,
  tiers: Tiers,
  now: Date,
  last?: Last,
  opts: { maxPools?: number; theme?: number; clock?: () => Date; line?: KujiLine } = {},
): Promise<PoolRow | null> {
  // 奖池线（240-2）：开池、编号、作废、每日上限都按线分开
  const line = opts.line ?? 'normal';
  // clock：现在的时间。请求在店锁、区服锁上排队时可能跨过 0 点，拿到锁后要重新取时间（backlog 一番赏）
  const at = opts.clock?.() ?? now;
  const day = gameDay(at);
  // 快速路径（一番赏终审 I2）：今天已有进行中的池就直接用，不拿区服锁；昨天的池按 day 过滤拿不到，开新池时再标过期
  const ready = await findOpen(tx, shardId, day, line);
  if (ready) return ready;
  // 普通线沿用原来的锁键；豪华线另用一把，两条线开池互不排队
  const lockKey = line === 'normal' ? `kuji:${shardId}` : `kuji:${shardId}:${line}`;
  await sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`.execute(tx);
  const locked = opts.clock?.() ?? at;
  if (gameDay(locked) !== day) return currentPool(tx, shardId, tiers, locked, last, opts);
  await tx
    .updateTable('kuji_pool')
    .set({ status: 'expired', closed_at: locked })
    .where('shard_id', '=', shardId)
    .where('line', '=', line)
    .where('status', '=', 'open')
    .where('day', '<', day)
    .execute();
  for (let attempt = 0; attempt < 5; attempt++) {
    const open = await findOpen(tx, shardId, day, line);
    if (open) return open;
    const max = await tx
      .selectFrom('kuji_pool')
      .select(sql<number>`coalesce(max(seq), 0)`.as('m'))
      .where('shard_id', '=', shardId)
      .where('line', '=', line)
      .where('day', '=', day)
      .executeTakeFirstOrThrow();
    // 每天最多开 maxPools 池（问题记录 274）：今天已经开满就不再开，返回空
    if (opts.maxPools !== undefined && Number(max.m) >= opts.maxPools) return null;
    const p = await openPool(tx, shardId, day, Number(max.m) + 1, tiers, locked, last, opts.theme, line);
    if (p) return p;
  }
  throw new Error(`kuji: cannot open pool for shard ${shardId}`);
}

async function findOpen(
  tx: Kysely<DB>,
  shardId: number,
  day: string,
  line: KujiLine,
): Promise<PoolRow | undefined> {
  return (await tx
    .selectFrom('kuji_pool')
    .select(COLS)
    .where('shard_id', '=', shardId)
    .where('line', '=', line)
    .where('day', '=', day)
    .where('status', '=', 'open')
    .orderBy('seq', 'desc')
    .executeTakeFirst()) as PoolRow | undefined;
}

/** 今天最后开的一池（不管状态），今天开满了以后看板显示它 */
export async function latestToday(
  tx: Kysely<DB>,
  shardId: number,
  day: string,
  line: KujiLine = 'normal',
): Promise<PoolRow | undefined> {
  return (await tx
    .selectFrom('kuji_pool')
    .select(COLS)
    .where('shard_id', '=', shardId)
    .where('line', '=', line)
    .where('day', '=', day)
    .orderBy('seq', 'desc')
    .executeTakeFirst()) as PoolRow | undefined;
}

/** 各档剩余张数 */
export async function tierLeft(tx: Kysely<DB>, poolId: string): Promise<Map<string, number>> {
  const rows = await tx
    .selectFrom('kuji_ticket')
    .select(['tier', sql<string>`count(*) filter (where drawn_at is null)`.as('left')])
    .where('pool_id', '=', poolId)
    .groupBy('tier')
    .execute();
  return new Map(rows.map((r) => [r.tier, Number(r.left)]));
}
