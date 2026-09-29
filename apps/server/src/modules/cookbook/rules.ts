import { FOODS } from '@dt/config';
import type { LearnType } from '@dt/shared';
import type { CookbookCounts } from '../../db/schema';

export interface NeedLine {
  foodsId: number;
  num: number;
}

export function mergeNeed(list: readonly NeedLine[]): NeedLine[] {
  const out: NeedLine[] = [];
  for (const l of list) {
    const same = out.find((x) => x.foodsId === l.foodsId);
    if (same) same.num += l.num;
    else out.push({ foodsId: l.foodsId, num: l.num });
  }
  return out;
}

export type LearnPlan =
  | { kind: 'normal'; consume: NeedLine[] }
  | { kind: 'wildcard'; level: number; consume: NeedLine[] }
  | { kind: 'none'; missing: Array<NeedLine & { have: number }> };

/**
 * 学习或升级需要的食材（规格书 03 §3.3）：都够时普通学习；
 * 恰好缺一种 1~5 级食材、且同级万能食材（466 + 等级）能补足缺口时，先扣光这种食材已有的，缺口用万能食材扣
 */
export function planLearn(
  need: readonly NeedLine[],
  have: (id: number) => number,
  level: (id: number) => number,
): LearnPlan {
  const lines = mergeNeed(need);
  const missing = lines.filter((l) => have(l.foodsId) < l.num).map((l) => ({ ...l, have: have(l.foodsId) }));
  if (missing.length === 0) return { kind: 'normal', consume: lines };
  if (missing.length === 1) {
    const m = missing[0]!;
    const lv = level(m.foodsId);
    if (lv >= 1 && lv <= 5) {
      const wid = FOODS.masterBase + lv;
      const gap = m.num - m.have;
      if (have(wid) >= gap) {
        const consume = lines.filter((l) => l.foodsId !== m.foodsId);
        if (m.have > 0) consume.push({ foodsId: m.foodsId, num: m.have });
        consume.push({ foodsId: wid, num: gap });
        return { kind: 'wildcard', level: lv, consume };
      }
    }
  }
  return { kind: 'none', missing };
}

export function learnTypeOf(plan: LearnPlan): LearnType {
  if (plan.kind === 'normal') return '0';
  if (plan.kind === 'wildcard') return String(plan.level) as LearnType;
  return 'z';
}

/** 学习或升级后的派生计数（纯函数，不修改入参） */
export function applyLearn(
  counts: CookbookCounts,
  streetId: number,
  from: number,
  to: number,
): CookbookCounts {
  const c: CookbookCounts = {
    learned: counts.learned,
    grade: [...counts.grade],
    street: { ...counts.street },
  };
  if (from > 0) {
    c.grade[from] = (c.grade[from] ?? 0) - 1;
  } else {
    c.learned += 1;
    c.street[String(streetId)] = (c.street[String(streetId)] ?? 0) + 1;
  }
  c.grade[to] = (c.grade[to] ?? 0) + 1;
  return c;
}

/** 本街目标品级（规格书 03 §3.8）：从 5 起算，本街全部达到当前目标就 +1，不超过 max */
export function streetTargetGrade(levels: Uint8Array, ids: readonly number[], max: number): number {
  let t = Math.min(5, max);
  while (t < max && ids.length > 0 && ids.every((id) => (levels[id] ?? 0) >= t)) t += 1;
  return t;
}

/** 把 ids 里的食谱都升到 target 还需要的食材总量（按食材 id 汇总） */
export function foodsNeedFor(
  ids: readonly number[],
  levels: Uint8Array,
  target: number,
  needOf: (id: number, grade: number) => readonly NeedLine[],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of ids) {
    for (let g = (levels[id] ?? 0) + 1; g <= target; g++) {
      for (const f of needOf(id, g)) out.set(f.foodsId, (out.get(f.foodsId) ?? 0) + f.num);
    }
  }
  return out;
}
