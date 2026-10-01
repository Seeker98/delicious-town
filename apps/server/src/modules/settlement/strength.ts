import { sql } from 'kysely';
import type { Tuning } from '@dt/config';
import { hashSeed, luckRate, seededRng, type Rng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';

/** 一次体力恢复（真实定时任务和快速模型共用）：已满返回 null */
export function strengthGain(
  r: { strength: number; strength_max: number; luck: number },
  agg: Record<string, number>,
  tuning: Tuning,
  rng: Rng,
): { add: number; cap: number } | null {
  const cap = r.strength_max + (agg.holyBless ?? 0);
  if (r.strength >= cap) return null;
  const base = rng.chance(luckRate(r.luck + (agg.luckValue ?? 0)))
    ? tuning.strength.luckyRegen
    : tuning.strength.regen;
  const mult = (agg.autoReStrength ?? 0) > 0 ? agg.autoReStrength! : 1;
  return { add: Math.round(base * mult), cap };
}

/**
 * 体力恢复（规格书 01 §1.10）：一条批量 UPDATE，相对增量；正被锁住的店跳过这一轮。
 * 加成用缓存的 effect_agg（最多滞后一轮结算），避免在锁外重算缓存。
 */
export async function regenStrength(
  d: GameDeps,
  shardId: number,
  period: string,
  _now: Date,
): Promise<{ updated: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const rows = await d.db
    .selectFrom('restaurant')
    .select(['id', 'strength', 'strength_max', 'luck', 'effect_agg'])
    .where('shard_id', '=', shardId)
    .execute();
  const ids: number[] = [];
  const adds: number[] = [];
  const caps: number[] = [];
  for (const r of rows) {
    const g = strengthGain(
      r,
      r.effect_agg ?? {},
      tuning,
      seededRng(hashSeed(shardId, 'strength', period, r.id)),
    );
    if (!g) continue;
    ids.push(r.id);
    adds.push(g.add);
    caps.push(g.cap);
  }
  let updated = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    // 按 id 顺序加锁、跳过正被玩家操作锁住的店（它们这一轮不恢复）：
    // 否则批量 UPDATE 按物理顺序加锁，会和按 id 顺序锁两家店的双店操作形成锁环
    const r = await sql`
      with u as (
        select * from unnest(${ids.slice(i, i + 1000)}::int[], ${adds.slice(i, i + 1000)}::int[], ${caps.slice(i, i + 1000)}::int[])
          as u(id, add, cap)
      ), l as (
        select r.id from restaurant r join u on u.id = r.id
        order by r.id
        for no key update of r skip locked
      )
      update restaurant r set strength = least(r.strength + u.add, u.cap)
      from u join l on l.id = u.id
      where r.id = u.id and r.strength < u.cap`.execute(d.db);
    updated += Number(r.numAffectedRows ?? 0);
  }
  return { updated };
}
