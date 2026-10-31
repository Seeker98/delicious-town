import type { Tuning } from '@dt/config';
import { DAY_MS, gameDay } from '@dt/shared';

export type T = Tuning['acquire'];

/** 热度保留 3 位小数 */
const r3 = (x: number) => Math.round(x * 1000) / 1000;

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/**
 * 窗口 [from, to) 里算平均用几天（收购 PR 3 审查）：收入汇总从收购上线那天才开始攒，最早的汇总日以前的天不算；
 * 最少 1 天，最多 priceDays。first 是全表最早的汇总日（不分店：新店没数据的天照样按 0 算）；一行都没有时照 priceDays
 */
export function windowDays(w: { from: string; to: string }, first: string | null, t: T): number {
  if (first === null) return t.priceDays;
  const from = Math.max(dayMs(w.from), dayMs(first));
  return Math.min(t.priceDays, Math.max(1, Math.round((dayMs(w.to) - from) / DAY_MS)));
}

/** 基础身价（问题记录 421）：近 days 天（默认 priceDays）合计 / days × priceMultiple，向下取整，不低于 minPrice */
export function basePrice(sumCoin: number, t: T, days: number = t.priceDays): number {
  return Math.max(t.minPrice, Math.floor((sumCoin / days) * t.priceMultiple));
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

/** 挂牌价比例：listMinRate ~ listMaxRate，5% 一档 */
export function validListRate(rate: number, t: T): boolean {
  const steps = Math.round(rate * 20);
  return Math.abs(rate * 20 - steps) < 1e-9 && rate >= t.listMinRate - 1e-9 && rate <= t.listMaxRate + 1e-9;
}

/** n × rate 向下取整：比例先换成整数百万分比再乘（同小镇发展基金），免得 700,000 × 0.9 算成 629,999 */
export const share = (n: number, rate: number): number => Math.floor((n * Math.round(rate * 1e6)) / 1e6);

/** 不能强收、买挂牌的原因 */
export type BuyBlock =
  | 'self'
  | 'mine'
  | 'npc'
  | 'banned'
  | 'buyer_star'
  | 'buyer_new'
  | 'buyer_owned'
  | 'not_listed'
  | 'star'
  | 'owned'
  | 'protected'
  | 'daily'
  | 'pair'
  | 'holdings'
  | 'buyer_daily';

export interface BuyFacts {
  buyerId: number;
  /** 买家的星级、账号注册时间 */
  buyerStar: number;
  buyerCreatedAt: Date;
  /** 买家今天已经收购、买下几家 */
  buyerTodayCount: number;
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
  /** 目标店今天已被强收几次 */
  todayCount: number;
  /** 这两家 pairDays 天内交易过 */
  pairRecent: boolean;
  /** 正在挂牌 */
  listed: boolean;
  now: Date;
}

/**
 * 强收（acquire）或买挂牌（listed）能不能做，不能时给原因；关联账号、银币够不够另外查。
 * 收购改版（2026-10-16）：强收只能收没有老板的店，有老板的只能买挂牌；买家要够星级、注册天数，每天有上限
 */
export function buyBlock(f: BuyFacts, t: T, way: 'acquire' | 'listed'): BuyBlock | null {
  if (f.targetId === f.buyerId) return 'self';
  if (f.targetOwnerId === f.buyerId) return 'mine';
  if (f.targetNpc) return 'npc';
  if (f.targetBanned) return 'banned';
  if (f.buyerStar < t.buyerMinStar) return 'buyer_star';
  if (f.now.getTime() - f.buyerCreatedAt.getTime() < t.buyerMinAccountDays * DAY_MS) return 'buyer_new';
  if (f.buyerOwned) return 'buyer_owned';
  if (way === 'listed' && !f.listed) return 'not_listed';
  if (f.targetStar < t.minStar) return 'star';
  if (way === 'acquire' && f.targetOwnerId !== null) return 'owned';
  if (f.protectedUntil !== null && f.protectedUntil > f.now) return 'protected';
  if (way === 'acquire' && f.todayCount >= t.maxPerDay) return 'daily';
  if (f.pairRecent) return 'pair';
  if (f.holdings >= t.maxHoldings) return 'holdings';
  if (f.buyerTodayCount >= t.buyerMaxPerDay) return 'buyer_daily';
  return null;
}

/** 一笔钱怎么分：给卖方（老板）、给店自己、销毁、税；四项加起来等于价格 */
export interface Split {
  sellerGot: number;
  storeGot: number;
  burn: number;
  tax: number;
}

/** 强收没有老板的店：店得 firstStoreRate，并购咨询费 firstBurnRate 销毁，其余是税（店自己就是卖方，sellerGot 为 0） */
export function splitFirst(price: number, t: T): Split {
  const storeGot = share(price, t.firstStoreRate);
  const burn = share(price, t.firstBurnRate);
  return { sellerGot: 0, storeGot, burn, tax: price - storeGot - burn };
}

/** 买挂牌：原老板得 1 − resaleStoreRate − taxRate，店得转会费 resaleStoreRate，其余是税 */
export function splitResale(price: number, t: T): Split {
  const sellerGot = share(price, 1 - t.resaleStoreRate - t.taxRate);
  const storeGot = share(price, t.resaleStoreRate);
  return { sellerGot, storeGot, burn: 0, tax: price - sellerGot - storeGot };
}

/** 卖方（老板）被封号、和店是关联账号：他那份不给，一起销毁（和让渡退回店一个道理，backlog 2026-10-31） */
export function withholdSeller(s: Split): Split {
  return { ...s, sellerGot: 0, burn: s.burn + s.sellerGot };
}

/** 赎身：老板得 1 − redeemBurnRate − taxRate，redeemBurnRate 销毁，其余是税 */
export function splitRedeem(price: number, t: T): Split {
  const sellerGot = share(price, 1 - t.redeemBurnRate - t.taxRate);
  const burn = share(price, t.redeemBurnRate);
  return { sellerGot, storeGot: 0, burn, tax: price - sellerGot - burn };
}

/** 赎身价：基础身价（不乘热度）；老板正在挂牌、挂牌价更低时按挂牌价 */
export function redeemPrice(
  s: { base: number; heat: number; list_rate: number | null },
  listed: boolean,
): number {
  const lp = listed ? listPrice(s) : null;
  return lp !== null && lp < s.base ? lp : s.base;
}

/** 打理成本、补给包按的日均：基础身价 ÷ priceMultiple（和身价同一个口径，每天 00:05 更新） */
export const avgOf = (base: number, t: T): number => Math.floor(base / t.priceMultiple);

/** 老板打理一次付的银币：日均 × tendCostRate，至少 1 */
export const tendCost = (base: number, t: T): number => Math.max(1, share(avgOf(base, t), t.tendCostRate));

/** 打理送店的补给包：日均每满 tendPackStep 一个，最多 tendPackMax 个 */
export const tendPacks = (base: number, t: T): number =>
  Math.min(t.tendPackMax, Math.floor(avgOf(base, t) / t.tendPackStep));

/** 两个游戏日差几天（to − from） */
export const dayDiff = (from: string, to: string): number => Math.round((dayMs(to) - dayMs(from)) / DAY_MS);

/**
 * 被收购的店这一天的抽成状态：老板今天打理过没有、几天没打理（从最近一次打理那天算；从没打理过按收购那天）、
 * 抽成比例（打理过 cedeTendRate，否则 cedeRate；tendHalfDays 天没打理减半，tendStopDays 天归零）
 */
export function cedeState(
  s: { tended_at: Date | null; acquired_at: Date | null },
  today: string,
  t: T,
): { tendedToday: boolean; idleDays: number; rate: number } {
  const since = s.tended_at ?? s.acquired_at;
  const idleDays = since === null ? 0 : Math.max(0, dayDiff(gameDay(since), today));
  const tendedToday = s.tended_at !== null && idleDays === 0;
  const factor = idleDays < t.tendHalfDays ? 1 : idleDays < t.tendStopDays ? 0.5 : 0;
  return { tendedToday, idleDays, rate: (tendedToday ? t.cedeTendRate : t.cedeRate) * factor };
}

/** 一轮结算的让渡：老板打理以后结算银币先 × tendMultiplier；让出 share(银币, 比例)，零头留给店。银币不是正数时不让 */
export function cedeRound(
  coin: number,
  st: { tendedToday: boolean; rate: number },
  t: T,
): { coin: number; ceded: number } {
  if (coin <= 0) return { coin, ceded: 0 };
  const c = st.tendedToday ? share(coin, t.tendMultiplier) : coin;
  return { coin: c, ceded: share(c, st.rate) };
}
