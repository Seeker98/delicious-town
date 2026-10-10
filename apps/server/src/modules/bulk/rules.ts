import type { Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';

export type BulkTuning = Tuning['bulk'];
export type BidIn = { restId: number; price: number; qty: number; rankedAt: Date };

/** 消掉浮点误差（1.1 × 1440 = 1584.0000000000002）再取整，同期货 */
const clean = (x: number) => Math.round(x * 1e6) / 1e6;
const ceilClean = (x: number) => Math.ceil(clean(x));

/** 每人上限：向下取整（大宗认购设计 §1.2） */
export const bulkCap = (n: number, t: BulkTuning) => Math.floor(clean(n * t.capRate));
/** 成团份数：向上取整（大宗认购设计 §1.3） */
export const bulkGroup = (n: number, t: BulkTuning) => Math.ceil(clean(n * t.groupRate));
/** 起拍价 = 期货单价 × reserveRate，向上取整 */
export const bulkReserve = (futuresUnit: number, t: BulkTuning) => ceilClean(futuresUnit * t.reserveRate);
/** 安慰奖门槛：出价不低于成交价 × consolationRate（向上取整）的落选者有安慰奖 */
export const consolationLine = (price: number, t: BulkTuning) => ceilClean(price * t.consolationRate);
/** 改出价时单价至少要加到多少 */
export const minRaisePrice = (old: number, t: BulkTuning) => ceilClean(old * (1 + t.minRaise));

/** 排名：单价高的在前；同价时排名时间早的在前；再同按店号（稳定） */
const ranked = (bids: readonly BidIn[]) =>
  [...bids].sort(
    (a, b) => b.price - a.price || a.rankedAt.getTime() - b.rankedAt.getTime() || a.restId - b.restId,
  );

/**
 * 分配（大宗认购设计 §1.4）：按排名一份一份分，分完 n 份或分完出价为止；
 * 成交价 = 最后分出去的那一份的出价（不满 n 份时是最低出价）；没人出价时为 null
 */
export function allocate(n: number, bids: readonly BidIn[]) {
  const won = new Map<number, number>();
  let left = n;
  let price: number | null = null;
  let demand = 0;
  for (const b of ranked(bids)) {
    demand += b.qty;
    const take = Math.min(b.qty, left);
    won.set(b.restId, take);
    if (take > 0) price = b.price;
    left -= take;
  }
  return { won, price, sold: n - left, demand };
}

/** 竞价中的公开数据（大宗认购设计 §1.3）：预计成交价、入围门槛、认购份数、人数，以及每家现在入围几份 */
export function standing(n: number, reserve: number, bids: readonly BidIn[]) {
  const a = allocate(n, bids);
  const full = a.demand >= n;
  return {
    price: a.price ?? reserve,
    threshold: full && a.price !== null ? a.price + 1 : reserve,
    demand: a.demand,
    bidders: bids.length,
    won: a.won,
  };
}

/** 真正的收盘时刻：[名义结束 − windowMin 分钟, 名义结束) 里随机，精确到毫秒 */
export function pickCloseAt(endsAt: Date, windowMin: number, rng: Rng): Date {
  const span = windowMin * 60_000;
  return new Date(endsAt.getTime() - span + Math.floor(rng.next() * span));
}

/** 按权重在有可选食材的等级里选一级（1~5）；都没有时 null */
export function pickLevel(
  weights: readonly number[],
  available: ReadonlySet<number>,
  rng: Rng,
): number | null {
  const opts = [1, 2, 3, 4, 5].filter((lv) => available.has(lv) && (weights[lv - 1] ?? 0) > 0);
  const total = opts.reduce((a, lv) => a + weights[lv - 1]!, 0);
  if (total <= 0) return null;
  let x = rng.next() * total;
  for (const lv of opts) {
    x -= weights[lv - 1]!;
    if (x < 0) return lv;
  }
  return opts[opts.length - 1]!;
}
