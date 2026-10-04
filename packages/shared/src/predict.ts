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

/**
 * C(y1, n1) − C(y0, n0)，分开算"大的一项"和 log1p 的部分再相减（backlog 238-1）：
 * 份额差极大时小的一项比大的一项小几十个数量级，直接两个 C 相减会被浮点吞掉、算成 0
 */
export function lmsrCostDiff(y0: number, n0: number, y1: number, n1: number, b: number): number {
  const part = (y: number, n: number) => {
    const a = y / b;
    const c = n / b;
    return { m: Math.max(a, c), l: Math.log1p(Math.exp(-Math.abs(a - c))) };
  };
  const p0 = part(y0, n0);
  const p1 = part(y1, n1);
  return b * (p1.m - p0.m + (p1.l - p0.l));
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

/** 一笔买卖的报价：买入向上取整（至少 1）、卖出向下取整，取整都向着系统 */
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
  const diff = lmsrCostDiff(s.y, s.n, yAfter, nAfter, s.b);
  const exact = t.unit * (dir === 'buy' ? diff : -diff);
  // 买入至少收 1：差距大到连 log1p 也下溢时不白送（backlog 238-1）
  const amount = dir === 'buy' ? Math.max(1, Math.ceil(exact)) : Math.floor(exact);
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
