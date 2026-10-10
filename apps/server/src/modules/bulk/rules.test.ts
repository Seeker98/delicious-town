import { describe, expect, it } from 'vitest';
import { seededRng } from '@dt/shared';
import {
  allocate,
  bulkCap,
  bulkGroup,
  bulkReserve,
  minRaisePrice,
  pickCloseAt,
  pickLevel,
  standing,
} from './rules';

const t = {
  openHour: 20,
  hours: 24,
  closeWindowMin: 5,
  qty: [150, 110, 80, 60, 45],
  levelWeights: [1, 1, 1, 1, 1],
  reserveRate: 1.1,
  capRate: 0.25,
  groupRate: 0.3,
  minRaise: 0.01,
  cooldownSec: 5,
  consolationRate: 0.9,
  consolation: { goods: 10202, num: 1 },
  blindMin: 60,
};
const at = (s: number) => new Date(1_000_000 + s * 1000);
const bid = (restId: number, price: number, qty: number, s = restId) => ({
  restId,
  price,
  qty,
  rankedAt: at(s),
});

describe('大宗认购规则（大宗认购设计 §1）', () => {
  it('每人上限向下取整、成团向上取整；起拍价和最小加价向上取整且消掉浮点误差', () => {
    expect([150, 110, 80, 60, 45].map((n) => bulkCap(n, t))).toEqual([37, 27, 20, 15, 11]);
    expect([150, 110, 80, 60, 45].map((n) => bulkGroup(n, t))).toEqual([45, 33, 24, 18, 14]);
    expect(bulkGroup(10, t)).toBe(3);
    expect(bulkReserve(51840, t)).toBe(57024);
    expect(bulkReserve(1440, t)).toBe(1584);
    expect(minRaisePrice(55000, t)).toBe(55550);
    expect(minRaisePrice(101, t)).toBe(103);
  });

  it('设计 §1.5 的例子：成交价 53,000（第 10 份），甲~戊各 2 份，己落选', () => {
    const r = allocate(10, [
      bid(1, 60000, 2),
      bid(2, 58000, 2),
      bid(3, 56000, 2),
      bid(4, 55000, 2),
      bid(5, 53000, 2),
      bid(6, 52000, 2),
    ]);
    expect(r.price).toBe(53000);
    expect(r.sold).toBe(10);
    expect(r.demand).toBe(12);
    expect([...r.won]).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
      [6, 0],
    ]);
  });

  it('边界上的人部分入围；同价按排名时间先后（Review Focus 2）', () => {
    const r = allocate(5, [bid(1, 60000, 3), bid(2, 55000, 3, 50), bid(3, 55000, 3, 40)]);
    expect(r.won.get(1)).toBe(3);
    expect(r.won.get(3)).toBe(2);
    expect(r.won.get(2)).toBe(0);
    expect(r.price).toBe(55000);
  });

  it('不满 n 份：全部入围，成交价是最低出价；没人出价时 price 为 null', () => {
    const r = allocate(10, [bid(1, 60000, 2), bid(2, 58000, 2)]);
    expect(r.price).toBe(58000);
    expect(r.sold).toBe(4);
    expect(allocate(10, []).price).toBeNull();
  });

  it('看板：满 n 份时预计成交价是第 n 份、门槛是它 + 1；不满时预计成交价是最低出价、门槛是起拍价', () => {
    const full = standing(4, 50000, [bid(1, 60000, 2), bid(2, 55000, 2), bid(3, 52000, 2)]);
    expect(full).toMatchObject({ price: 55000, threshold: 55001, demand: 6, bidders: 3 });
    const part = standing(10, 50000, [bid(1, 60000, 2)]);
    expect(part).toMatchObject({ price: 60000, threshold: 50000, demand: 2, bidders: 1 });
    expect(standing(10, 50000, [])).toMatchObject({ price: 50000, threshold: 50000, demand: 0, bidders: 0 });
  });

  it('收盘时刻在名义结束前 windowMin 分钟内', () => {
    const end = new Date('2026-10-11T12:00:00Z');
    for (let s = 1; s <= 50; s++) {
      const c = pickCloseAt(end, 5, seededRng(s)).getTime();
      expect(c).toBeGreaterThanOrEqual(end.getTime() - 5 * 60_000);
      expect(c).toBeLessThan(end.getTime());
    }
  });

  it('选等级：只在有可选食材的等级里按权重选；都没有时为 null', () => {
    expect(pickLevel([1, 1, 1, 1, 1], new Set([4]), seededRng(1))).toBe(4);
    expect(pickLevel([0, 0, 0, 0, 1], new Set([2, 5]), seededRng(1))).toBe(5);
    expect(pickLevel([1, 1, 1, 1, 0], new Set([5]), seededRng(1))).toBeNull();
    expect(pickLevel([1, 1, 1, 1, 1], new Set(), seededRng(1))).toBeNull();
  });
});
