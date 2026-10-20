import { sql, type Kysely } from 'kysely';
import { isFeatureEnabled, type GameConfig, type ShardSettings } from '@dt/config';
import type { DB, RestaurantRow } from '../../db/schema';
import { computeEffectAgg, EQUIP_OFF_KEY } from './aggregate';

export interface EffectSourceInput {
  sourceType: string;
  sourceId: number;
  effects: Record<string, number>;
  expiresAt: Date | null;
}

export type ActiveEffect = EffectSourceInput;

export async function markEffectsDirty(db: Kysely<DB>, restId: number): Promise<void> {
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
  await markEffectsDirty(db, restId);
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
  await markEffectsDirty(db, restId);
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

/**
 * 取加成汇总：缓存有效直接返回；来源有变动或有来源到期时重算并写回。
 * 汇总里包含收集类派生键（设计文档 §3.1）。调用方应已持有该店的行锁。
 * pre：调用方刚在同一事务里锁行读到、之后没改过加成的三列时传入，省一次查询（结算用，问题记录 258）。
 * settings：区服关掉厨具功能时不算厨具、套装加成；缓存是按另一种开关算的也要重算（backlog 411~413）
 */
/** 按现在的来源、持有和厨具开关重算汇总（不写回） */
async function freshAgg(
  db: Kysely<DB>,
  restId: number,
  now: Date,
  config: GameConfig,
  settings: Pick<ShardSettings, 'tuning' | 'features'>,
  equipOff: boolean,
) {
  const sources = await listActiveEffects(db, restId, now);
  const owned = await db
    .selectFrom('store_item')
    .select('goods_id')
    .where('rest_id', '=', restId)
    .where('num', '>', 0)
    .execute();
  return computeEffectAgg(sources, new Set(owned.map((o) => o.goods_id)), config, settings.tuning, now, {
    equipOff,
  });
}

/**
 * 不锁店读别家（或批量读）的加成汇总：别的滞后照旧容忍（最多一轮结算），但缓存是按另一种厨具开关算的就当场重算
 * （backlog：区服关掉厨具后，体力恢复、赛厨榜防守方、好友骑手的幸运原来要等这家店下次结算或操作）。
 * 写回只在缓存没被别的操作改过、也没标脏时做（乐观比对），免得盖掉锁内刚写的
 */
export async function cachedAgg(
  db: Kysely<DB>,
  row: Pick<RestaurantRow, 'id' | 'effect_agg'>,
  now: Date,
  config: GameConfig,
  settings: Pick<ShardSettings, 'tuning' | 'features'>,
): Promise<Record<string, number>> {
  const equipOff = !isFeatureEnabled(settings, 'equip');
  if ((row.effect_agg[EQUIP_OFF_KEY] === 1) === equipOff) return row.effect_agg;
  const { agg, nextExpireAt } = await freshAgg(db, row.id, now, config, settings, equipOff);
  await db
    .updateTable('restaurant')
    .set({ effect_agg: JSON.stringify(agg), effect_next_expire_at: nextExpireAt })
    .where('id', '=', row.id)
    .where('effect_dirty', '=', false)
    .where(sql<boolean>`effect_agg = ${JSON.stringify(row.effect_agg)}::jsonb`)
    .execute();
  return agg;
}

export async function getEffectAgg(
  db: Kysely<DB>,
  restId: number,
  now: Date,
  config: GameConfig,
  settings: Pick<ShardSettings, 'tuning' | 'features'>,
  pre?: Pick<RestaurantRow, 'effect_agg' | 'effect_dirty' | 'effect_next_expire_at'>,
): Promise<Record<string, number>> {
  const r =
    pre ??
    (await db
      .selectFrom('restaurant')
      .select(['effect_agg', 'effect_dirty', 'effect_next_expire_at'])
      .where('id', '=', restId)
      .executeTakeFirstOrThrow());
  const equipOff = !isFeatureEnabled(settings, 'equip');
  const stale =
    r.effect_dirty ||
    (r.effect_next_expire_at !== null && r.effect_next_expire_at <= now) ||
    (r.effect_agg[EQUIP_OFF_KEY] === 1) !== equipOff;
  if (!stale) return r.effect_agg;
  const { agg, nextExpireAt } = await freshAgg(db, restId, now, config, settings, equipOff);
  await db
    .updateTable('restaurant')
    .set({ effect_agg: JSON.stringify(agg), effect_next_expire_at: nextExpireAt, effect_dirty: false })
    .where('id', '=', restId)
    .execute();
  return agg;
}
