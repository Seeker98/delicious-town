import { boostDefOf, type BoostItem } from '@dt/shared';
import type { ShardSettings } from './shard';

/**
 * 把正在生效的全服加成套到区服设置上（148-4 设计 §6.1）：同一项连乘后夹到范围内，
 * 有 cap 取上限（原值已超过上限时保持原值），int 取整（原值 0 保持 0）；返回新对象，不改传入的设置
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
      const v0 = tuning[sec]![name]!;
      let v = v0 * k;
      // 上限只挡住加成本身，不把区服已经调过上限的原值压低（backlog 148-4）
      if (def.cap !== undefined) v = Math.max(Math.min(v, def.cap), Math.min(v0, v));
      // 原值是 0 表示区服关掉了这一项，保持 0；否则取整后至少 1
      if (def.int) v = v0 === 0 ? 0 : Math.max(1, Math.round(v));
      tuning[sec]![name] = v;
    }
  }
  return { ...s, tuning: tuning as unknown as ShardSettings['tuning'] };
}
