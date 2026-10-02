import type { ActivityKind, GoalsDef, GridDef, PassDef } from '@dt/shared';
import { ApiError } from '../api/client';

type Goal = GoalsDef['goals'][number];
export const newGoal = (key = 'signin', target = 1): Goal => ({ key, target, award: {} as Goal['award'] });

export function defaultDef(kind: 'goals'): GoalsDef;
export function defaultDef(kind: 'grid'): GridDef;
export function defaultDef(kind: 'pass'): PassDef;
export function defaultDef(kind: ActivityKind): GoalsDef | GridDef | PassDef;
export function defaultDef(kind: ActivityKind): GoalsDef | GridDef | PassDef {
  if (kind === 'goals') return { goals: [newGoal()] };
  if (kind === 'grid')
    return {
      size: 3,
      cells: Array.from({ length: 9 }, () => newGoal()),
      lineAward: {} as Goal['award'],
      fullAward: {} as Goal['award'],
    };
  return {
    rules: [{ key: 'signin', points: 10, dailyCap: 10 }],
    levels: [{ points: 10, free: null, premium: null }],
    unlock: { diamond: 100 },
  };
}

let rowSeq = 0;
/** 给 n 行各发一个本地唯一的 key：删除中间一行时，下面的行不会复用上一行的编辑器（终审 I1） */
export const rowKeys = (n: number): number[] => Array.from({ length: n }, () => rowSeq++);

export const signinTemplate = (): GoalsDef => ({ goals: [1, 3, 5, 7].map((d) => newGoal('signin', d)) });

const TEXT: Record<string, string> = {
  before_start: '结束时间要晚于开始时间',
  unknown_action: '请选择行为',
  cell_count: '格子数和尺寸不符',
  duplicate_key: '同一个行为只能有一条规则',
  empty_level: '普通和进阶奖励不能都空',
  not_increasing: '积分要比上一档高',
  empty_price: '至少填一项解锁价格',
  empty: '奖励不能为空',
  duplicate: '同一种道具或食材只能列一次',
};

/** 服务端 VALIDATION_FAILED 的 issues → 路径 → 中文 */
export function issueMap(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return {};
  const issues = (e.params.issues ?? []) as Array<{ path: string; message: string }>;
  return Object.fromEntries(issues.map((i) => [i.path, TEXT[i.message] ?? '填写的内容不正确']));
}
