import type {
  ActivityKind,
  BoostActivityDef,
  CoopDef,
  ExchangeDef,
  GoalsDef,
  GridDef,
  PassDef,
} from '@dt/shared';
import { ApiError } from '../api/client';

type Goal = GoalsDef['goals'][number];
export const newGoal = (key = 'signin', target = 1): Goal => ({ key, target, award: {} as Goal['award'] });

export function defaultDef(kind: 'goals'): GoalsDef;
export function defaultDef(kind: 'grid'): GridDef;
export function defaultDef(kind: 'pass'): PassDef;
export function defaultDef(kind: 'boost'): BoostActivityDef;
export function defaultDef(kind: 'exchange'): ExchangeDef;
export function defaultDef(kind: 'coop'): CoopDef;
export function defaultDef(
  kind: ActivityKind,
): GoalsDef | GridDef | PassDef | BoostActivityDef | ExchangeDef | CoopDef;
export function defaultDef(
  kind: ActivityKind,
): GoalsDef | GridDef | PassDef | BoostActivityDef | ExchangeDef | CoopDef {
  if (kind === 'boost') return { items: [{ key: 'exp', factor: 2 }] };
  if (kind === 'coop')
    return {
      rules: [{ key: 'signin', points: 10, dailyCap: 10 }],
      milestones: [{ target: 1000, minContribution: 0, award: {} as Goal['award'] }],
      ranks: [{ from: 1, to: 1, award: {} as Goal['award'] }],
    };
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
  bad_range: '起始名次不能大于结束名次',
  overlap: '名次段不能重叠，要按名次从小到大排',
  unknown: '道具或食材不存在',
  retired: '道具或食材已下架',
};

/** 服务端 VALIDATION_FAILED 的 issues → 路径 → 中文 */
export function issueMap(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return {};
  const issues = (e.params.issues ?? []) as Array<{ path: string; message: string }>;
  return Object.fromEntries(issues.map((i) => [i.path, TEXT[i.message] ?? '填写的内容不正确']));
}

/** 这一层或更深一层的第一条错误：奖励里某个道具 id 不存在时，错误路径是 …award.goods.0.id，在奖励下面显示 */
export function errUnder(errors: Record<string, string>, path: string): string | undefined {
  const k = Object.keys(errors).find((x) => x === path || x.startsWith(`${path}.`));
  return k === undefined ? undefined : errors[k];
}

/** 某一行下面的全部错误（如 def.rules.0. 开头的分数、上限），逐条显示在那一行（backlog 148-1） */
export const errsUnder = (errors: Record<string, string>, prefix: string): Array<[string, string]> =>
  Object.entries(errors).filter(([k]) => k.startsWith(prefix));
