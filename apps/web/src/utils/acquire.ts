import type { AcquireRulesDto, AcquireSplitDto } from '@dt/shared';

/** n × rate 向下取整：比例先换成百万分比，和服务端 share 一样 */
export const share = (n: number, rate: number): number => Math.floor((n * Math.round(rate * 1e6)) / 1e6);

/** 挂牌卖出怎么分（挂牌前预览用；和服务端 splitResale 一样）：原老板、店、税 */
export function resaleSplit(
  price: number,
  r: Pick<AcquireRulesDto, 'resaleStoreRate' | 'taxRate'>,
): AcquireSplitDto {
  const sellerGot = share(price, 1 - r.resaleStoreRate - r.taxRate);
  const storeGot = share(price, r.resaleStoreRate);
  return { sellerGot, storeGot, burn: 0, tax: price - sellerGot - storeGot };
}

/**
 * 收下以后多少天回本（收购改版 2026-10-16）：不打理按 cedeRate；天天打理按 cedeTendRate × tendMultiplier 减掉打理成本。
 * 日均是 0 时为 null
 */
export function paybackDays(
  price: number,
  avg: number,
  r: Pick<AcquireRulesDto, 'cedeRate' | 'cedeTendRate' | 'tendMultiplier' | 'tendCostRate'>,
): { plain: number; tended: number } | null {
  if (avg <= 0) return null;
  const tendedRate = r.cedeTendRate * r.tendMultiplier - r.tendCostRate;
  return {
    plain: Math.round(price / (avg * r.cedeRate)),
    tended: Math.round(price / (avg * tendedRate)),
  };
}
