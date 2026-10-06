import type { Tuning } from '@dt/config';

export type T = Tuning['acquire'];

/** 热度保留 3 位小数 */
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** 基础身价（问题记录 421）：近 priceDays 天合计 / priceDays × priceMultiple，向下取整，不低于 minPrice */
export function basePrice(sumCoin: number, t: T): number {
  return Math.max(t.minPrice, Math.floor((sumCoin / t.priceDays) * t.priceMultiple));
}

/** 身价 = 基础身价 × 热度，取整 */
export const priceOf = (s: { base: number; heat: number }): number => Math.round(s.base * s.heat);

/** 被强收：热度 +heatStep，不超过 heatMax */
export const heatAfterAcquire = (heat: number, t: T): number => r3(Math.min(t.heatMax, heat + t.heatStep));
/** 打折挂牌被买下：热度 −heatListDrop，不低于 1 */
export const heatAfterListedSale = (heat: number, t: T): number => r3(Math.max(1, heat - t.heatListDrop));
/** 每天往 1.0 回落：1 + (热度 − 1) × (1 − heatDecay) */
export const decayHeat = (heat: number, t: T): number => Math.max(1, r3(1 + (heat - 1) * (1 - t.heatDecay)));

/** 挂牌价 = 身价 × 折扣，取整；没挂牌为 null */
export function listPrice(s: { base: number; heat: number; list_rate: number | null }): number | null {
  return s.list_rate === null ? null : Math.round(priceOf(s) * s.list_rate);
}

/** 挂牌折扣：listMinRate ~ 1，5% 一档 */
export function validListRate(rate: number, t: T): boolean {
  const steps = Math.round(rate * 20);
  return Math.abs(rate * 20 - steps) < 1e-9 && rate >= t.listMinRate - 1e-9 && rate <= 1;
}

/** n × rate 向下取整：比例先换成整数百万分比再乘（同小镇发展基金），免得 700,000 × 0.9 算成 629,999 */
export const share = (n: number, rate: number): number => Math.floor((n * Math.round(rate * 1e6)) / 1e6);

/** 不能强收、买挂牌的原因 */
export type BuyBlock =
  | 'self'
  | 'mine'
  | 'npc'
  | 'banned'
  | 'not_listed'
  | 'star'
  | 'protected'
  | 'daily'
  | 'pair'
  | 'buyer_owned'
  | 'holdings';

export interface BuyFacts {
  buyerId: number;
  targetId: number;
  targetOwnerId: number | null;
  /** 买家自己被收购了 */
  buyerOwned: boolean;
  /** 买家名下几家 */
  holdings: number;
  targetStar: number;
  targetNpc: boolean;
  targetBanned: boolean;
  protectedUntil: Date | null;
  /** 目标店今天已被强收、买下几次 */
  todayCount: number;
  /** 这两家 pairDays 天内交易过 */
  pairRecent: boolean;
  /** 正在挂牌 */
  listed: boolean;
  now: Date;
}

/** 强收（acquire）或买挂牌（listed）能不能做，不能时给原因；关联账号、银币够不够另外查 */
export function buyBlock(f: BuyFacts, t: T, way: 'acquire' | 'listed'): BuyBlock | null {
  if (f.targetId === f.buyerId) return 'self';
  if (f.targetOwnerId === f.buyerId) return 'mine';
  if (f.targetNpc) return 'npc';
  if (f.targetBanned) return 'banned';
  if (way === 'listed' && !f.listed) return 'not_listed';
  if (f.targetStar < t.minStar) return 'star';
  if (f.protectedUntil !== null && f.protectedUntil > f.now) return 'protected';
  if (f.todayCount >= t.maxPerDay) return 'daily';
  if (f.pairRecent) return 'pair';
  if (f.buyerOwned) return 'buyer_owned';
  if (f.holdings >= t.maxHoldings) return 'holdings';
  return null;
}

/**
 * 一家被收购的店给老板的分红（收购 PR 2）：前一天结算银币 × dividendRate，那天打理过再 × (1 + tendBonus)；
 * 前一天结算不满 minRounds 轮不发（null）
 */
export function dividendOf(coin: number, rounds: number, tended: boolean, t: T): number | null {
  if (rounds < t.minRounds) return null;
  return Math.max(0, share(coin, t.dividendRate * (tended ? 1 + t.tendBonus : 1)));
}

/** 老板一天的分红上限：自己近 priceDays 天的日均结算银币 × dividendCapRate */
export const dividendCap = (ownerCoinSum: number, t: T): number =>
  share(Math.floor(ownerCoinSum / t.priceDays), t.dividendCapRate);

/** 合计超过上限时每家按比例压（向下取整，合计不超过上限）；用 BigInt 乘，免得大数超过 2^53 */
export function capDividends(raw: readonly number[], cap: number): number[] {
  const total = raw.reduce((a, b) => a + b, 0);
  if (total <= cap) return [...raw];
  const c = BigInt(cap);
  const sum = BigInt(total);
  return raw.map((x) => Number((BigInt(x) * c) / sum));
}
