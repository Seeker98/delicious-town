import { invalidateAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import { markEffectsDirty, removeEffectSource, upsertEffectSource } from '../effects/service';
import { loadGems, pieceTotal } from './instances';
import { activeSuits, suitAggEffects } from './rules';

/**
 * 穿戴变化后同步加成来源（设计文档 §3.3）：equip 行存穿戴厨具的幸运之和，
 * suit 行每个激活档位一行（只含进汇总的键）。结算从加成汇总里读，不需要改
 */
export async function syncEquipEffects(op: Op): Promise<void> {
  const worn = await op.tx
    .selectFrom('equip')
    .selectAll()
    .where('rest_id', '=', op.rest.id)
    .where('worn', '=', true)
    .execute();
  const gems = await loadGems(
    op.tx,
    worn.map((e) => e.id),
  );
  const luck = worn.reduce((s, e) => s + pieceTotal(e, gems.get(e.id) ?? []).luck, 0);
  if (luck !== 0) {
    await upsertEffectSource(op.tx, op.rest.id, {
      sourceType: 'equip',
      sourceId: 0,
      effects: { luckValue: luck },
      expiresAt: null,
    });
  } else {
    await removeEffectSource(op.tx, op.rest.id, 'equip', 0);
  }
  await op.tx
    .deleteFrom('effect_source')
    .where('rest_id', '=', op.rest.id)
    .where('source_type', '=', 'suit')
    .execute();
  for (const s of activeSuits(
    worn.map((e) => e.suit_id),
    op.config.suits,
  )) {
    for (const [i, tier] of s.suit.tiers.entries()) {
      if (!s.active[i]) continue;
      const effects = suitAggEffects(tier.effects);
      if (Object.keys(effects).length === 0) continue;
      await upsertEffectSource(op.tx, op.rest.id, {
        sourceType: 'suit',
        sourceId: s.suit.id * 10 + i,
        effects,
        expiresAt: null,
      });
    }
  }
  await markEffectsDirty(op.tx, op.rest.id);
  invalidateAgg(op);
}
