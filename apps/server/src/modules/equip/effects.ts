import { EQUIP_ATTRS, type EquipAttrs, type Tuning } from '@dt/config';
import { invalidateAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import { markEffectsDirty, removeEffectSource, upsertEffectSource } from '../effects/service';
import { loadGems, pieceTotal } from './instances';
import { activeSuits, addAttrs, suitAggEffects, zeroAttrs } from './rules';

/**
 * 穿戴厨具（含宝石）进 equip 行的加成：幸运之和；加权点数（幸运不算）× 系数的
 * 最终银币、最终经验、特色菜金牌（问题记录 411）。为 0 的键不写
 */
export function equipEffects(totals: EquipAttrs, t: Tuning['equip']['income']): Record<string, number> {
  let points = 0;
  for (const k of EQUIP_ATTRS) if (k !== 'luck') points += totals[k] * t.weights[k];
  const round = (x: number) => Math.round(x * 1e9) / 1e9;
  const out: Record<string, number> = {
    luckValue: totals.luck,
    coinRate: round(points * t.coinRate),
    expRate: round(points * t.expRate),
    mcGoldRate: round(points * t.mcGoldRate),
  };
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}

/** 一家店穿戴中厨具的属性合计（基础 + 强化 + 宝石） */
export function wornTotals(
  worn: ReadonlyArray<Parameters<typeof pieceTotal>[0]>,
  gems: ReadonlyMap<number, Parameters<typeof pieceTotal>[1]>,
): EquipAttrs {
  return worn.reduce((acc, e) => addAttrs(acc, pieceTotal(e, gems.get(e.id) ?? [])), zeroAttrs());
}

/**
 * 穿戴变化后同步加成来源（设计文档 §3.3）：equip 行存穿戴厨具的幸运之和和收益加成（问题记录 411），
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
  const effects = equipEffects(wornTotals(worn, gems), op.tuning.equip.income);
  if (Object.keys(effects).length > 0) {
    await upsertEffectSource(op.tx, op.rest.id, {
      sourceType: 'equip',
      sourceId: 0,
      effects,
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
