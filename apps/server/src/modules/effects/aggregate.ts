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

/**
 * 区服关掉厨具功能时（backlog 411~413，用户定）：穿戴厨具（equip 行）和套装（suit 行）的加成都不算，
 * 汇总里记上这个键，开关变了就重算（见 effects/service getEffectAgg）
 */
export const EQUIP_OFF_KEY = 'equipOff';
const EQUIP_SOURCES = new Set(['equip', 'suit']);

/** 区服关掉厨具功能时列给玩家看的加成来源也去掉厨具、套装（和汇总一致） */
export function shownEffects<T extends { sourceType: string }>(list: T[], equipOff: boolean): T[] {
  return equipOff ? list.filter((s) => !EQUIP_SOURCES.has(s.sourceType)) : list;
}

export interface ActiveEffectLike extends EffectLike {
  sourceType: string;
  sourceId: number;
}

/**
 * 收藏的件数：牌匾按仓库里有的算，勋章（荣誉）、盆栽、名画按生效中的荣誉来源算。
 * 加成汇总和支线“收藏”（问题记录 515）共用
 */
export function collectionCounts(
  owned: Iterable<number>,
  honorIds: Iterable<number>,
  config: GameConfig,
): { plaques: number; honors: number; pots: number; paintings: number } {
  let plaques = 0;
  for (const id of owned) {
    const g = config.goods.get(id);
    if (g && g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque) plaques += 1;
  }
  let honors = 0;
  let pots = 0;
  let paintings = 0;
  for (const id of honorIds) {
    // 基金勋章只加经验（240-2）：不算勋章收藏，否则会额外加银币收入
    if (FUND_MEDALS.has(id)) continue;
    honors += 1;
    const dt = config.goods.get(id)?.deviceType;
    if (dt === DEVICE_TYPE.pot) pots += 1;
    if (dt === DEVICE_TYPE.painting) paintings += 1;
  }
  return { plaques, honors, pots, paintings };
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
  opts: { equipOff?: boolean } = {},
): EffectAggregate {
  const live = sources.filter(
    (s) => (!s.expiresAt || s.expiresAt > now) && !(opts.equipOff && EQUIP_SOURCES.has(s.sourceType)),
  );
  const { agg, nextExpireAt } = aggregateEffects(live, now);
  const honorIds = live.filter((s) => s.sourceType === 'honor').map((s) => s.sourceId);
  const derived = collectionEffects(
    {
      ...collectionCounts(owned, honorIds, config),
      an2023: owned.has(GOODS.an2023Plaque),
      an2025: owned.has(GOODS.an2025Plaque),
      mdcg: owned.has(GOODS.mdcgPlaque),
    },
    tuning.collection,
    config.bundle.potTiers,
    config.bundle.paintingTiers,
  );
  for (const [k, v] of Object.entries(derived)) agg[k] = (agg[k] ?? 0) + v;
  if (opts.equipOff) agg[EQUIP_OFF_KEY] = 1;
  return { agg, nextExpireAt };
}
