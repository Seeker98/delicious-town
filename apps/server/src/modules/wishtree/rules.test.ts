import { describe, expect, it } from 'vitest';
import { gameTime, seededRng } from '@dt/shared';
import { pickPrize, pickWinner, roundWindow } from './rules';

describe('许愿树规则（许愿树设计 §1.1）', () => {
  it('一轮从 D 的 hour 点到 D+1 的同一时刻', () => {
    const w = roundWindow('2026-10-11', 20);
    expect(w.opensAt.getTime()).toBe(gameTime('2026-10-11', 20).getTime());
    expect(w.endsAt.getTime()).toBe(gameTime('2026-10-12', 20).getTime());
  });

  it('按权重抽道具：权重为 0 的不会出现（检查不允许，防御一下）；大致符合权重', () => {
    const prizes = [
      { goods: 1, num: 1, weight: 1 },
      { goods: 2, num: 5, weight: 3 },
      { goods: 3, num: 1, weight: 0 },
    ];
    const rng = seededRng(7);
    const n: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 4000; i++) n[pickPrize(prizes, rng).goods]!++;
    expect(n[3]).toBe(0);
    expect(n[2]! / n[1]!).toBeGreaterThan(2.5);
    expect(n[2]! / n[1]!).toBeLessThan(3.5);
    expect(pickPrize([prizes[1]!], seededRng(1))).toEqual({ goods: 2, num: 5 });
  });

  it('抽中奖店：没人时为 null；大致等概率；和传入顺序无关', () => {
    expect(pickWinner([], seededRng(1))).toBeNull();
    const rng = seededRng(3);
    const n = new Map<number, number>();
    for (let i = 0; i < 3000; i++) {
      const w = pickWinner([30, 10, 20], rng)!;
      n.set(w, (n.get(w) ?? 0) + 1);
    }
    for (const id of [10, 20, 30]) expect(n.get(id)!).toBeGreaterThan(850);
    expect(pickWinner([30, 10, 20], seededRng(5))).toBe(pickWinner([10, 20, 30], seededRng(5)));
  });
});
