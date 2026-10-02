import { boostDefOf, type BoostItem } from '@dt/shared';
import type { ShardSettings } from './shard';

/**
 * 把正在生效的全服加成套到区服设置上（148-4 设计 §6.1）：同一项连乘后夹到范围内，
 * 有 cap 取上限，int 取整；返回新对象，不改传入的设置
 */
export function applyBoosts(s: ShardSettings, active: BoostItem[][]): ShardSettings {
  const total = new Map<string, number>();
  for (const items of active) for (const it of items) total.set(it.key, (total.get(it.key) ?? 1) * it.factor);
  if (total.size === 0) return s;
  const tuning = structuredClone(s.tuning) as unknown as Record<string, Record<string, number>>;
  for (const [key, f] of total) {
    const def = boostDefOf(key);
    if (!def) continue;
    const k = Math.min(def.max, Math.max(def.min, f));
    for (const path of def.paths) {
      const [sec, name] = path.split('.') as [string, string];
      let v = tuning[sec]![name]! * k;
      if (def.cap !== undefined) v = Math.min(v, def.cap);
      if (def.int) v = Math.max(1, Math.round(v));
      tuning[sec]![name] = v;
    }
  }
  return { ...s, tuning: tuning as unknown as ShardSettings['tuning'] };
}
