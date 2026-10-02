import type { Food, Tuning } from '@dt/config';

export type ExchangeTuning = Tuning['exchange'];

/** 可交易：稀有食材，和菜场判断稀有的口径一致（156-1 设计 §2） */
export function isTradable(food: Food | undefined): boolean {
  return food !== undefined && food.odds < 100;
}

/** 当天允许的挂单价（156-1 设计 §5） */
export function priceBand(ref: number, t: ExchangeTuning): { min: number; max: number } {
  return { min: Math.max(1, Math.ceil(ref * t.bandLow)), max: Math.floor(ref * t.bandHigh) };
}

/** 成交量加权均价，四舍五入 */
export function weightedPrice(trades: Array<{ price: number; qty: number }>): number {
  const qty = trades.reduce((s, x) => s + x.qty, 0);
  return Math.round(trades.reduce((s, x) => s + x.price * x.qty, 0) / qty);
}

/** 卖方手续费 */
export function feeOf(price: number, qty: number, t: ExchangeTuning): number {
  return Math.floor(price * qty * t.feeRate);
}
