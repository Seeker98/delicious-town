import { DEVICE_TYPE, FUND_MEDALS, GOODS, GOODS_TYPE, type GameConfig, type Tuning } from '@dt/config';
import { collectionEffects } from './collection';

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

export interface ActiveEffectLike extends EffectLike {
  sourceType: string;
  sourceId: number;
}

/**
 * 加成汇总（真实服务和快速模型共用，快速模拟设计 §4.3）：
 * 来源汇总 + 牌匾、勋章、盆栽、名画、纪念牌匾的收藏派生
 */
export function computeEffectAgg(
  sources: ActiveEffectLike[],
  owned: ReadonlySet<number>,
  config: GameConfig,
  tuning: Tuning,
  now: Date,
): EffectAggregate {
  const live = sources.filter((s) => !s.expiresAt || s.expiresAt > now);
  const { agg, nextExpireAt } = aggregateEffects(live, now);
  let plaques = 0;
  for (const id of owned) {
    const g = config.goods.get(id);
    if (g && g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque) plaques += 1;
  }
  let honors = 0;
  let pots = 0;
  let paintings = 0;
  for (const s of live) {
    if (s.sourceType !== 'honor') continue;
    // 基金勋章只加经验（240-2）：不算勋章收藏，否则会额外加银币收入
    if (FUND_MEDALS.has(s.sourceId)) continue;
    honors += 1;
    const dt = config.goods.get(s.sourceId)?.deviceType;
    if (dt === DEVICE_TYPE.pot) pots += 1;
    if (dt === DEVICE_TYPE.painting) paintings += 1;
  }
  const derived = collectionEffects(
    {
      plaques,
      honors,
      pots,
      paintings,
      an2023: owned.has(GOODS.an2023Plaque),
      an2025: owned.has(GOODS.an2025Plaque),
      mdcg: owned.has(GOODS.mdcgPlaque),
    },
    tuning.collection,
    config.bundle.potTiers,
    config.bundle.paintingTiers,
  );
  for (const [k, v] of Object.entries(derived)) agg[k] = (agg[k] ?? 0) + v;
  return { agg, nextExpireAt };
}
