import { sql } from 'kysely';
import { hashSeed, luckRate, seededRng } from '@dt/shared';
import type { GameDeps } from '../../core/deps';

/**
 * 体力恢复（规格书 01 §1.10）：一条批量 UPDATE，相对增量、不锁店。
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
    const agg = r.effect_agg ?? {};
    const cap = r.strength_max + (agg.holyBless ?? 0);
    if (r.strength >= cap) continue;
    const rng = seededRng(hashSeed(shardId, 'strength', period, r.id));
    const base = rng.chance(luckRate(r.luck + (agg.luckValue ?? 0)))
      ? tuning.strength.luckyRegen
      : tuning.strength.regen;
    const mult = (agg.autoReStrength ?? 0) > 0 ? agg.autoReStrength! : 1;
    ids.push(r.id);
    adds.push(Math.round(base * mult));
    caps.push(cap);
  }
  let updated = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await sql`
      update restaurant r set strength = least(r.strength + u.add, u.cap)
      from unnest(${ids.slice(i, i + 1000)}::int[], ${adds.slice(i, i + 1000)}::int[], ${caps.slice(i, i + 1000)}::int[])
        as u(id, add, cap)
      where r.id = u.id and r.strength < u.cap`.execute(d.db);
    updated += Number(r.numAffectedRows ?? 0);
  }
  return { updated };
}
