import type { ActivityKind, BoostActivityDef, ExchangeDef, GoalsDef, GridDef, PassDef } from '@dt/shared';
import { ApiError } from '../api/client';

type Goal = GoalsDef['goals'][number];
export const newGoal = (key = 'signin', target = 1): Goal => ({ key, target, award: {} as Goal['award'] });

export function defaultDef(kind: 'goals'): GoalsDef;
export function defaultDef(kind: 'grid'): GridDef;
export function defaultDef(kind: 'pass'): PassDef;
export function defaultDef(kind: 'boost'): BoostActivityDef;
export function defaultDef(kind: 'exchange'): ExchangeDef;
export function defaultDef(kind: ActivityKind): GoalsDef | GridDef | PassDef | BoostActivityDef | ExchangeDef;
export function defaultDef(
  kind: ActivityKind,
): GoalsDef | GridDef | PassDef | BoostActivityDef | ExchangeDef {
  if (kind === 'boost') return { items: [{ key: 'exp', factor: 2 }] };
  if (kind === 'exchange')
    return {
      currencies: [{ name: '' }],
      drops: [{ key: 'signin', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
      shop: [{ cost: [{ currency: 0, num: 1 }], award: {} as Goal['award'], limit: 1 }],
      graceHours: 24,
    };
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
  out_of_range: '倍数超出范围',
  unknown_boost: '请选择加成项目',
  two_decimals: '倍数最多两位小数',
  no_effect: '至少有一项倍数不等于 1',
  boost_all_levels: '全服加成对所有等级生效，最低等级只能是 1',
  duplicate_name: '货币名不能重复',
  no_currency: '请选择存在的货币',
  four_decimals: '概率最多两位小数（百分比）',
  duplicate_currency: '同一种货币只能列一次',
};

/** 服务端 VALIDATION_FAILED 的 issues → 路径 → 中文 */
export function issueMap(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return {};
  const issues = (e.params.issues ?? []) as Array<{ path: string; message: string }>;
  return Object.fromEntries(issues.map((i) => [i.path, TEXT[i.message] ?? '填写的内容不正确']));
}
