import type { ActivationTask, Tuning } from '@dt/config';
import type { CookbookCounts } from '../../db/schema';
import { holdStep } from '../predict/holdStep';

/** 状态型条件的当前值；不认识的键返回 null（对应的功能尚未实现） */
export function stateValue(
  key: string,
  rest: { level: number; star_level: number; oil_level: number },
  counts: CookbookCounts,
  extra: Record<string, number> = {},
): number | null {
  if (key in extra) return extra[key]!;
  if (key === 'rest.level') return rest.level;
  if (key === 'rest.star') return rest.star_level;
  if (key === 'oil.level') return rest.oil_level;
  if (key === 'cookbooks.learned') return counts.learned;
  const m = /^cookbooks\.grade(\d+)$/.exec(key);
  if (m) {
    const g = Number(m[1]);
    return counts.grade.slice(g).reduce((s, x) => s + (x ?? 0), 0);
  }
  // 某条街学会了几道（问题记录 515：杂碎街）
  const street = /^cookbooks\.street\.(\d+)$/.exec(key);
  if (street) return counts.street[Number(street[1])] ?? 0;
  return null;
}

/** 当日活跃总分 = Σ min(次数, 上限) × 分值 */
export function activationTotal(
  acts: readonly ActivationTask[],
  counts: ReadonlyMap<number, number>,
): number {
  return acts.reduce((s, a) => s + Math.min(counts.get(a.id) ?? 0, a.limitTimes) * a.points, 0);
}

/**
 * 任务名里的数（515 支线扩充 B 遗留：原来写死，区服调了数值名字就对不上）：名字里写 {n}，
 * 按条件的键从区服数值取，列表里随任务一起发下去，页面代进名字。没有数的键返回 undefined
 */
export function questVars(key: string, tuning: Tuning): { n: number } | undefined {
  switch (key) {
    case 'kraken.favorHigh':
      return { n: tuning.temple.tentacleFavor };
    case 'predict.hold100':
      return { n: holdStep(100, tuning.predict.maxHold) };
    case 'predict.hold200':
      return { n: holdStep(200, tuning.predict.maxHold) };
    case 'invite.level10':
      return { n: tuning.invite.levels.lv10 };
    case 'invite.level30':
      return { n: tuning.invite.levels.lv30 };
    default:
      return undefined;
  }
}
