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
 * 恰好缺一种 1~5 级食材、且同级万能食材（FOODS.masterBase + 等级）能补足缺口时，先扣光这种食材已有的，缺口用万能食材扣
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

/** 遗忘一道已学食谱（偷学失败，子项目 4A 设计文档 裁定 9）：applyLearn 的反向 */
export function applyForget(counts: CookbookCounts, streetId: number, from: number): CookbookCounts {
  const c: CookbookCounts = {
    learned: Math.max(0, counts.learned - 1),
    grade: [...counts.grade],
    street: { ...counts.street },
  };
  c.grade[from] = Math.max(0, (c.grade[from] ?? 0) - 1);
  c.street[String(streetId)] = Math.max(0, (c.street[String(streetId)] ?? 0) - 1);
  return c;
}

/**
 * 学会记录按存储位存（重新编号 PR 3）：levels[存储位] = 品级，存储位由 cookbookIndex.slotOf 按食谱 id 查。
 * 没有这道菜（或老店字节串不够长）算 0
 */
export function gradeOf(levels: Uint8Array, slotOf: Int32Array, id: number): number {
  const s = slotOf[id] ?? -1;
  return s < 0 ? 0 : (levels[s] ?? 0);
}

/** 写品级；字节串要先按 cookbookIndex.slots 补齐（padLevels） */
export function setGrade(levels: Uint8Array, slotOf: Int32Array, id: number, grade: number): void {
  const s = slotOf[id] ?? -1;
  if (s < 0) throw new Error(`unknown cookbook ${id}`);
  levels[s] = grade;
}

/** 本街目标品级（规格书 03 §3.8）：从 5 起算，本街全部达到当前目标就 +1，不超过 max */
export function streetTargetGrade(
  levels: Uint8Array,
  slotOf: Int32Array,
  ids: readonly number[],
  max: number,
): number {
  let t = Math.min(5, max);
  while (t < max && ids.length > 0 && ids.every((id) => gradeOf(levels, slotOf, id) >= t)) t += 1;
  return t;
}

/** 把 ids 里的食谱都升到 target 还需要的食材总量（按食材 id 汇总） */
export function foodsNeedFor(
  ids: readonly number[],
  levels: Uint8Array,
  slotOf: Int32Array,
  target: number,
  needOf: (id: number, grade: number) => readonly NeedLine[],
): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of ids) {
    for (let g = gradeOf(levels, slotOf, id) + 1; g <= target; g++) {
      for (const f of needOf(id, g)) out.set(f.foodsId, (out.get(f.foodsId) ?? 0) + f.num);
    }
  }
  return out;
}

/**
 * 已学食谱字节串补齐到 cookbookIndex.slots（问题记录 284；重新编号 PR 3 起按存储位）：新菜上线前开的店长度不够，
 * 往类型化数组越界写会被静默丢掉，学了新菜也存不下
 */
export function padLevels(levels: Uint8Array, slots: number): Uint8Array {
  if (levels.length >= slots) return levels;
  const out = new Uint8Array(slots);
  out.set(levels);
  return out;
}
