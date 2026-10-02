/** 事件合约的报价（238-1 设计 §4）：LMSR，前后端共用 */
export type PredictSide = 'yes' | 'no';
export type PredictDir = 'buy' | 'sell';

/** 成本函数 C(y, n) = b·ln(e^(y/b) + e^(n/b))，用 log-sum-exp 避免溢出 */
export function lmsrCost(y: number, n: number, b: number): number {
  const a = y / b;
  const c = n / b;
  const m = Math.max(a, c);
  return b * (m + Math.log(Math.exp(a - m) + Math.exp(c - m)));
}

/** "是"的价格（0~1）；"否"是 1 − 它 */
export function lmsrPrice(y: number, n: number, b: number): number {
  return 1 / (1 + Math.exp((n - y) / b));
}

/** 初始概率 p0（0~1）对应的初始份额：y − n = b·ln(p0/(1−p0))，小的一边为 0 */
export function initialShares(p0: number, b: number): { y: number; n: number } {
  const d = b * Math.log(p0 / (1 - p0));
  return d >= 0 ? { y: d, n: 0 } : { y: 0, n: -d };
}

/** 显示用的百分比：四舍五入，夹在 1~99 */
export function predictPercent(p: number): number {
  return Math.min(99, Math.max(1, Math.round(p * 100)));
}

export interface PredictQuote {
  /** 成交额（不含手续费） */
  amount: number;
  fee: number;
  /** 买入付出（成交额 + 手续费）或卖出所得（成交额 − 手续费） */
  total: number;
  yAfter: number;
  nAfter: number;
  /** 成交后"是"的价格 */
  priceAfter: number;
}

/** 一笔买卖的报价：买入向上取整、卖出向下取整，取整都向着系统 */
export function predictQuote(
  s: { y: number; n: number; b: number },
  side: PredictSide,
  dir: PredictDir,
  qty: number,
  t: { unit: number; feeRate: number },
): PredictQuote {
  const d = dir === 'buy' ? qty : -qty;
  const yAfter = side === 'yes' ? s.y + d : s.y;
  const nAfter = side === 'no' ? s.n + d : s.n;
  const hi = dir === 'buy' ? lmsrCost(yAfter, nAfter, s.b) : lmsrCost(s.y, s.n, s.b);
  const lo = dir === 'buy' ? lmsrCost(s.y, s.n, s.b) : lmsrCost(yAfter, nAfter, s.b);
  const exact = t.unit * (hi - lo);
  const amount = dir === 'buy' ? Math.ceil(exact) : Math.floor(exact);
  const fee = Math.ceil(amount * t.feeRate);
  return {
    amount,
    fee,
    total: dir === 'buy' ? amount + fee : amount - fee,
    yAfter,
    nAfter,
    priceAfter: lmsrPrice(yAfter, nAfter, s.b),
  };
}
