import { sql, type Kysely } from 'kysely';
import type { Tuning } from '@dt/config';
import { gameDay } from '@dt/shared';
import type { DB } from '../../db/schema';

type Tiers = Tuning['kuji']['tiers'];

export interface PoolRow {
  id: string;
  shard_id: number;
  day: string;
  seq: number;
  status: 'open' | 'sold_out' | 'expired';
  total: number;
  last_rest_id: number | null;
}

const COLS = ['id', 'shard_id', 'day', 'seq', 'status', 'total', 'last_rest_id'] as const;

/** 开一池：按 tiers 生成签（各档连续编号，抽签时随机取，所以顺序无所谓）；唯一冲突（别人同时开了）返回 null */
export async function openPool(
  tx: Kysely<DB>,
  shardId: number,
  day: string,
  seq: number,
  tiers: Tiers,
  now: Date,
): Promise<PoolRow | null> {
  const total = tiers.reduce((s, x) => s + x.count, 0);
  const p = (await tx
    .insertInto('kuji_pool')
    .values({ shard_id: shardId, day, seq, status: 'open', total, created_at: now })
    .onConflict((oc) => oc.columns(['shard_id', 'day', 'seq']).doNothing())
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
 * 没有就开下一池（seq = 今天最大 + 1）。并发开池靠唯一索引，冲突时重读
 */
export async function currentPool(
  tx: Kysely<DB>,
  shardId: number,
  tiers: Tiers,
  now: Date,
): Promise<PoolRow> {
  const day = gameDay(now);
  await tx
    .updateTable('kuji_pool')
    .set({ status: 'expired', closed_at: now })
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('day', '<', day)
    .execute();
  for (let attempt = 0; attempt < 5; attempt++) {
    const open = (await tx
      .selectFrom('kuji_pool')
      .select(COLS)
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .where('status', '=', 'open')
      .orderBy('seq', 'desc')
      .executeTakeFirst()) as PoolRow | undefined;
    if (open) return open;
    const max = await tx
      .selectFrom('kuji_pool')
      .select(sql<number>`coalesce(max(seq), 0)`.as('m'))
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .executeTakeFirstOrThrow();
    const p = await openPool(tx, shardId, day, Number(max.m) + 1, tiers, now);
    if (p) return p;
  }
  throw new Error(`kuji: cannot open pool for shard ${shardId}`);
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
