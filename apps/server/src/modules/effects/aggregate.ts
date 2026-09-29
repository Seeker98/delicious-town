export interface EffectLike {
  effects: Record<string, number>;
  expiresAt: Date | null;
}

export interface EffectAggregate {
  agg: Record<string, number>;
  /** 最早一个仍有效来源的到期时间，届时需要重新汇总 */
  nextExpireAt: Date | null;
}

export function aggregateEffects(sources: EffectLike[], now: Date): EffectAggregate {
  const agg: Record<string, number> = {};
  let nextExpireAt: Date | null = null;
  for (const s of sources) {
    if (s.expiresAt && s.expiresAt <= now) continue;
    for (const [k, v] of Object.entries(s.effects)) agg[k] = (agg[k] ?? 0) + v;
    if (s.expiresAt && (!nextExpireAt || s.expiresAt < nextExpireAt)) nextExpireAt = s.expiresAt;
  }
  for (const k of Object.keys(agg)) agg[k] = Math.round(agg[k]! * 1e9) / 1e9;
  return { agg, nextExpireAt };
}
