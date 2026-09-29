import { luckRate } from '@dt/shared';
import { getEffectAgg } from '../modules/effects/service';
import type { Op } from './op';

/** 本操作内的加成汇总（缓存在 op 上；发放勋章或牌匾后调用 invalidateAgg） */
export async function opAgg(op: Op): Promise<Record<string, number>> {
  const hit = op.cache.get('agg') as Record<string, number> | undefined;
  if (hit) return hit;
  const agg = await getEffectAgg(op.tx, op.rest.id, op.now, op.config, op.tuning);
  op.cache.set('agg', agg);
  return agg;
}

export function invalidateAgg(op: Op): void {
  op.cache.delete('agg');
}

/** 幸运总值 = 基础幸运 + 加成里的 luckValue；幸运率见规格书 00 §0.5 */
export async function opLuck(op: Op): Promise<{ sum: number; rate: number }> {
  const agg = await opAgg(op);
  const sum = op.rest.luck + (agg.luckValue ?? 0);
  return { sum, rate: luckRate(sum) };
}
