import type { ActivationTask, Task } from '@dt/config';
import type { CookbookCounts } from '../../db/schema';

/** 状态型条件的当前值；不认识的键返回 null（对应的功能尚未实现） */
export function stateValue(
  key: string,
  rest: { level: number; star_level: number; oil_level: number },
  counts: CookbookCounts,
): number | null {
  if (key === 'rest.level') return rest.level;
  if (key === 'rest.star') return rest.star_level;
  if (key === 'oil.level') return rest.oil_level;
  if (key === 'cookbooks.learned') return counts.learned;
  const m = /^cookbooks\.grade(\d+)$/.exec(key);
  if (m) {
    const g = Number(m[1]);
    return counts.grade.slice(g).reduce((s, x) => s + (x ?? 0), 0);
  }
  return null;
}

/** 从 step 开始，跳过功能不可用的主线步骤；全部完成时返回最后一步 +1 */
export function effectiveMainStep(
  step: number,
  mains: readonly Task[],
  available: (feature: string) => boolean,
): number {
  const byStep = new Map(mains.map((t) => [t.step, t]));
  let s = step;
  for (;;) {
    const t = byStep.get(s);
    if (!t || available(t.feature)) return s;
    s += 1;
  }
}

/** 可见的支线：step < 主线进度、没完成过、功能可用 */
export function visibleSide(
  tasks: readonly Task[],
  mainStep: number,
  done: ReadonlySet<number>,
  available: (feature: string) => boolean,
): Task[] {
  return tasks.filter((t) => !t.main && t.step < mainStep && !done.has(t.id) && available(t.feature));
}

/** 当日活跃总分 = Σ min(次数, 上限) × 分值 */
export function activationTotal(
  acts: readonly ActivationTask[],
  counts: ReadonlyMap<number, number>,
): number {
  return acts.reduce((s, a) => s + Math.min(counts.get(a.id) ?? 0, a.limitTimes) * a.points, 0);
}
