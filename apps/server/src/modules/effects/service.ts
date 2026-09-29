import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import { aggregateEffects } from './aggregate';

export interface EffectSourceInput {
  sourceType: string;
  sourceId: number;
  effects: Record<string, number>;
  expiresAt: Date | null;
}

export type ActiveEffect = EffectSourceInput;

async function markDirty(db: Kysely<DB>, restId: number): Promise<void> {
  await db.updateTable('restaurant').set({ effect_dirty: true }).where('id', '=', restId).execute();
}

export async function upsertEffectSource(
  db: Kysely<DB>,
  restId: number,
  s: EffectSourceInput,
): Promise<void> {
  const effects = JSON.stringify(s.effects);
  await db
    .insertInto('effect_source')
    .values({
      rest_id: restId,
      source_type: s.sourceType,
      source_id: s.sourceId,
      effects,
      expires_at: s.expiresAt,
    })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'source_type', 'source_id']).doUpdateSet({ effects, expires_at: s.expiresAt }),
    )
    .execute();
  await markDirty(db, restId);
}

export async function removeEffectSource(
  db: Kysely<DB>,
  restId: number,
  sourceType: string,
  sourceId: number,
): Promise<void> {
  await db
    .deleteFrom('effect_source')
    .where('rest_id', '=', restId)
    .where('source_type', '=', sourceType)
    .where('source_id', '=', sourceId)
    .execute();
  await markDirty(db, restId);
}

export async function listActiveEffects(db: Kysely<DB>, restId: number, now: Date): Promise<ActiveEffect[]> {
  const rows = await db
    .selectFrom('effect_source')
    .select(['source_type', 'source_id', 'effects', 'expires_at'])
    .where('rest_id', '=', restId)
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
    .orderBy('id')
    .execute();
  return rows.map((r) => ({
    sourceType: r.source_type,
    sourceId: r.source_id,
    effects: r.effects,
    expiresAt: r.expires_at,
  }));
}

/** 取加成汇总：缓存有效直接返回；来源有变动或有来源到期时重算并写回。调用方应已持有该店的行锁 */
export async function getEffectAgg(
  db: Kysely<DB>,
  restId: number,
  now: Date,
): Promise<Record<string, number>> {
  const r = await db
    .selectFrom('restaurant')
    .select(['effect_agg', 'effect_dirty', 'effect_next_expire_at'])
    .where('id', '=', restId)
    .executeTakeFirstOrThrow();
  const stale = r.effect_dirty || (r.effect_next_expire_at !== null && r.effect_next_expire_at <= now);
  if (!stale) return r.effect_agg;
  const { agg, nextExpireAt } = aggregateEffects(await listActiveEffects(db, restId, now), now);
  await db
    .updateTable('restaurant')
    .set({ effect_agg: JSON.stringify(agg), effect_next_expire_at: nextExpireAt, effect_dirty: false })
    .where('id', '=', restId)
    .execute();
  return agg;
}
