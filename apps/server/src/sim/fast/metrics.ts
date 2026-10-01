import type { BotDay } from '../metrics';
import type { FastResult } from './run';

export const PERSONA_ORDER = ['diligent', 'normal', 'casual'] as const;
export const PERSONA_NAMES: Record<string, string> = { diligent: '勤快', normal: '普通', casual: '休闲' };

/** 第 p 分位（0~1）：排好序取下标 min(n-1, ⌊p·n⌋)；空数组给 null */
export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

export const median = (xs: number[]) => percentile(xs, 0.5);

/** 结果里出现过的画像，按勤快、普通、休闲的顺序 */
export function personasOf(results: FastResult[]): string[] {
  const seen = new Set(results.flatMap((r) => r.days.map((d) => d.persona)));
  return PERSONA_ORDER.filter((p) => seen.has(p));
}

/** 所有结果里出现过的最高星级（至少 1），关键指标表按 1..这个星级出列 */
export function starsShown(results: FastResult[]): number {
  return Math.max(1, ...results.flatMap((r) => r.days.map((d) => d.star)));
}

export interface KeyRow {
  variant: string;
  persona: string;
  cells: Record<string, number | null>;
}

/**
 * 关键指标（设计 §7 第 2 项）：到达各星级的中位天数和到最后都没到的比例；
 * 第 7、14、30 天的中位等级（超过模拟天数为 null）；每天净银币中位数；卡住的比例
 */
export function keyTable(results: FastResult[], days: number): KeyRow[] {
  const stars = starsShown(results);
  const out: KeyRow[] = [];
  for (const r of results) {
    for (const persona of personasOf([r])) {
      const rows = r.days.filter((d) => d.persona === persona);
      const bots = [...new Set(rows.map((d) => d.bot))];
      const cells: Record<string, number | null> = {};
      for (let s = 1; s <= stars; s++) {
        const reached = bots
          .map((b) => rows.find((d) => d.bot === b && d.star >= s)?.day)
          .filter((x): x is number => x !== undefined);
        cells[`star${s}Days`] = median(reached);
        cells[`star${s}Never`] = bots.length === 0 ? null : (bots.length - reached.length) / bots.length;
      }
      for (const d of [7, 14, 30])
        cells[`day${d}Level`] = d > days ? null : median(rows.filter((x) => x.day === d).map((x) => x.level));
      cells.coinPerDay = median(
        bots.map((b) => {
          const mine = rows.filter((d) => d.bot === b);
          const first = mine.find((d) => d.day === 0)?.coin ?? 0;
          const last = mine.reduce((a, d) => (d.day > a.day ? d : a), mine[0]!).coin;
          return days > 0 ? (last - first) / days : 0;
        }),
      );
      cells.stuckRate =
        bots.length === 0 ? null : r.stuck.filter((x) => x.persona === persona).length / bots.length;
      out.push({ variant: r.name, persona, cells });
    }
  }
  return out;
}

export interface CalibrationRow {
  day: number;
  persona: string;
  field: 'level' | 'star' | 'coin' | 'learned';
  fast: number;
  full: number;
  ok: boolean;
}

/**
 * 核对（设计 §8）：按画像和天比较中位数；等级差 ≤1、星级相同、银币差 ≤20%、食谱数差 ≤15%。
 * 小数值另给绝对容差（银币 1 万、食谱 2 道）：开礼包等运气差异在数值小时会超过百分比
 */
export function compareCalibration(
  fast: BotDay[],
  full: BotDay[],
): { rows: CalibrationRow[]; pass: boolean } {
  const rel = (a: number, b: number, tol: number, abs: number) =>
    Math.abs(a - b) <= Math.max(tol * Math.max(Math.abs(a), Math.abs(b)), abs);
  const rows: CalibrationRow[] = [];
  const keys = new Set(fast.map((d) => `${d.persona}|${d.day}`));
  for (const key of [...keys].sort()) {
    const [persona, dayStr] = key.split('|') as [string, string];
    const day = Number(dayStr);
    const a = fast.filter((d) => d.persona === persona && d.day === day);
    const b = full.filter((d) => d.persona === persona && d.day === day);
    if (b.length === 0) continue;
    const m = (xs: BotDay[], f: (d: BotDay) => number) => median(xs.map(f))!;
    const add = (
      field: CalibrationRow['field'],
      f: (d: BotDay) => number,
      ok: (x: number, y: number) => boolean,
    ) => {
      const x = m(a, f);
      const y = m(b, f);
      rows.push({ day, persona, field, fast: x, full: y, ok: ok(x, y) });
    };
    add(
      'level',
      (d) => d.level,
      (x, y) => Math.abs(x - y) <= 1,
    );
    add(
      'star',
      (d) => d.star,
      (x, y) => x === y,
    );
    add(
      'coin',
      (d) => d.coin,
      (x, y) => rel(x, y, 0.2, 10_000),
    );
    add(
      'learned',
      (d) => d.learned,
      (x, y) => rel(x, y, 0.15, 2),
    );
  }
  return { rows, pass: rows.every((r) => r.ok) };
}
