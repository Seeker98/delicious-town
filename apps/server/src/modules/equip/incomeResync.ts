import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Kysely } from 'kysely';
import type { Tuning } from '@dt/config';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import type { DB, EquipRow } from '../../db/schema';
import { removeEffectSource, upsertEffectSource } from '../effects/service';
import { equipEffects, wornTotals } from './effects';
import { loadGems } from './instances';

/**
 * 按当前系数重写一个区服里每家店的 equip 加成行（问题记录 411）：上线前的行只有幸运，
 * 后台改了 tuning.equip.income 以后也要重算。值变了才写，店铺标脏下次重算汇总。
 * 同一个事务里先改来源、再标脏（和勋章重写一样）
 */
export async function resyncEquipIncome(
  db: Kysely<DB>,
  shardId: number,
  t: Tuning['equip']['income'],
): Promise<{ restaurants: number }> {
  return db.transaction().execute(async (tx) => {
    const shardRests = tx.selectFrom('restaurant').select('id').where('shard_id', '=', shardId);
    const worn = await tx
      .selectFrom('equip')
      .selectAll()
      .where('worn', '=', true)
      .where('rest_id', 'in', shardRests)
      .execute();
    const gems = await loadGems(
      tx,
      worn.map((e) => e.id),
    );
    const byRest = new Map<number, EquipRow[]>();
    for (const e of worn) byRest.set(e.rest_id, [...(byRest.get(e.rest_id) ?? []), e]);
    const old = new Map(
      (
        await tx
          .selectFrom('effect_source')
          .select(['rest_id', 'effects'])
          .where('source_type', '=', 'equip')
          .where('source_id', '=', 0)
          .where('rest_id', 'in', shardRests)
          .execute()
      ).map((r) => [r.rest_id, r.effects as Record<string, number>]),
    );
    const dirty: number[] = [];
    for (const restId of [...new Set([...byRest.keys(), ...old.keys()])].sort((a, b) => a - b)) {
      const effects = equipEffects(wornTotals(byRest.get(restId) ?? [], gems), t);
      const before = old.get(restId);
      const empty = Object.keys(effects).length === 0;
      if (empty ? before === undefined : isDeepStrictEqual(before, effects)) continue;
      if (empty) await removeEffectSource(tx, restId, 'equip', 0);
      else
        await upsertEffectSource(tx, restId, { sourceType: 'equip', sourceId: 0, effects, expiresAt: null });
      dirty.push(restId);
    }
    if (dirty.length > 0)
      await tx.updateTable('restaurant').set({ effect_dirty: true }).where('id', 'in', dirty).execute();
    return { restaurants: dirty.length };
  });
}

/** 系数（区服自己的）变了才跑一次；第一次上线时每个区服跑一次 */
export function equipIncomeJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'equip-income-resync',
      feature: 'equip',
      period: (_now, settings) =>
        'income-' +
        createHash('sha256').update(JSON.stringify(settings.tuning.equip.income)).digest('hex').slice(0, 12),
      run: async ({ shardId, settings }) => resyncEquipIncome(d.db, shardId, settings.tuning.equip.income),
    },
  ];
}
