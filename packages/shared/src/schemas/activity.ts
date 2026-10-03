import { z } from 'zod';
import { ACTIVITY_ACTIONS } from '../activity';
import { boostDefOf, type BoostItem } from '../boost';
import { limitedText, rewardItems, type RewardItems } from './mail';

export const ACTIVITY_TITLE_MAX = 40;
export const ACTIVITY_BODY_MAX = 1000;
export const ACTIVITY_KINDS = ['goals', 'grid', 'pass', 'boost', 'exchange', 'coop'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const actionKey = z.string().refine((k) => Object.hasOwn(ACTIVITY_ACTIONS, k), { message: 'unknown_action' });
const goal = z.object({
  key: actionKey,
  target: z.number().int().min(1).max(100_000),
  award: rewardItems,
});
const idNum = z.object({ id: z.number().int().positive(), num: z.number().int().min(1).max(9999) });

export const goalsDef = z.object({ goals: z.array(goal).min(1).max(20) });
export const gridDef = z
  .object({
    size: z.union([z.literal(3), z.literal(4)]),
    cells: z.array(goal),
    lineAward: rewardItems,
    fullAward: rewardItems,
  })
  .refine((d) => d.cells.length === d.size * d.size, { path: ['cells'], message: 'cell_count' });
export const passDef = z.object({
  rules: z
    .array(
      z.object({
        key: actionKey,
        points: z.number().int().min(1).max(1000),
        dailyCap: z.number().int().min(1).max(100_000),
      }),
    )
    .min(1)
    .max(20)
    .refine((rs) => new Set(rs.map((r) => r.key)).size === rs.length, { message: 'duplicate_key' }),
  levels: z
    .array(
      z
        .object({
          points: z.number().int().min(1).max(100_000_000),
          free: rewardItems.nullable(),
          premium: rewardItems.nullable(),
        })
        .refine((l) => l.free !== null || l.premium !== null, { message: 'empty_level' }),
    )
    .min(1)
    .max(50)
    .superRefine((ls, ctx) => {
      ls.forEach((l, i) => {
        if (i > 0 && l.points <= ls[i - 1]!.points)
          ctx.addIssue({ code: 'custom', path: [i, 'points'], message: 'not_increasing' });
      });
    }),
  unlock: z
    .object({
      diamond: z.number().int().min(1).max(100_000).optional(),
      goods: z.array(idNum).max(5).optional(),
    })
    .refine((u) => Boolean(u.diamond) || Boolean(u.goods?.length), { message: 'empty_price' }),
});
/** 全服合力（148-3 设计 §3）：规则同战令；里程碑看本区服总分和个人门槛；名次段结束后发邮件 */
export const coopDef = z
  .object({
    rules: passDef.shape.rules,
    milestones: z
      .array(
        z.object({
          target: z.number().int().min(1).max(1_000_000_000),
          minContribution: z.number().int().min(0).max(100_000_000),
          award: rewardItems,
        }),
      )
      .min(1)
      .max(10),
    ranks: z
      .array(
        z.object({
          from: z.number().int().min(1).max(100),
          to: z.number().int().min(1).max(100),
          award: rewardItems,
        }),
      )
      .max(10),
  })
  .superRefine((d, ctx) => {
    d.milestones.forEach((m, i) => {
      if (i > 0 && m.target <= d.milestones[i - 1]!.target)
        ctx.addIssue({ code: 'custom', path: ['milestones', i, 'target'], message: 'not_increasing' });
    });
    d.ranks.forEach((r, i) => {
      if (r.from > r.to) ctx.addIssue({ code: 'custom', path: ['ranks', i, 'to'], message: 'bad_range' });
      if (i > 0 && r.from <= d.ranks[i - 1]!.to)
        ctx.addIssue({ code: 'custom', path: ['ranks', i, 'from'], message: 'overlap' });
    });
  });
export type CoopDef = z.infer<typeof coopDef>;
export type GoalsDef = z.infer<typeof goalsDef>;
export type GridDef = z.infer<typeof gridDef>;
export type PassDef = z.infer<typeof passDef>;
export type ActivitySpec =
  | { kind: 'goals'; def: GoalsDef }
  | { kind: 'grid'; def: GridDef }
  | { kind: 'pass'; def: PassDef }
  | { kind: 'boost'; def: BoostActivityDef }
  | { kind: 'exchange'; def: ExchangeDef }
  | { kind: 'coop'; def: CoopDef };

const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
export const boostDef = z.object({
  items: z
    .array(
      z.object({
        key: z.string().refine((k) => boostDefOf(k) !== undefined, { message: 'unknown_boost' }),
        factor: z.number().positive(),
      }),
    )
    .min(1)
    .max(10)
    .superRefine((items, ctx) => {
      if (new Set(items.map((i) => i.key)).size !== items.length)
        ctx.addIssue({ code: 'custom', message: 'duplicate_key' });
      items.forEach((it, i) => {
        const d = boostDefOf(it.key);
        if (!twoDecimals(it.factor))
          ctx.addIssue({ code: 'custom', path: [i, 'factor'], message: 'two_decimals' });
        else if (d && (it.factor < d.min || it.factor > d.max))
          ctx.addIssue({ code: 'custom', path: [i, 'factor'], message: 'out_of_range' });
      });
      if (items.every((i) => i.factor === 1)) ctx.addIssue({ code: 'custom', message: 'no_effect' });
    }),
});
export type BoostActivityDef = { items: BoostItem[] };

const fourDecimals = (n: number) => Math.abs(n * 10000 - Math.round(n * 10000)) < 1e-6;
export const exchangeDef = z
  .object({
    currencies: z
      .array(z.object({ name: z.string().trim().min(1).max(12) }))
      .min(1)
      .max(8)
      .refine((cs) => new Set(cs.map((c) => c.name)).size === cs.length, { message: 'duplicate_name' }),
    drops: z
      .array(
        z.object({
          key: actionKey,
          chance: z.number().gt(0).max(1).refine(fourDecimals, { message: 'four_decimals' }),
          currency: z.number().int().min(0),
          num: z.number().int().min(1).max(99),
          dailyCap: z.number().int().min(1).max(9999),
        }),
      )
      .min(1)
      .max(20),
    shop: z
      .array(
        z.object({
          cost: z
            .array(z.object({ currency: z.number().int().min(0), num: z.number().int().min(1).max(9999) }))
            .min(1)
            .max(4)
            .refine((c) => new Set(c.map((x) => x.currency)).size === c.length, {
              message: 'duplicate_currency',
            }),
          award: rewardItems,
          limit: z.number().int().min(1).max(999),
        }),
      )
      .min(1)
      .max(30),
    graceHours: z.number().int().min(0).max(168).default(24),
  })
  .superRefine((d, ctx) => {
    const n = d.currencies.length;
    d.drops.forEach((r, i) => {
      if (r.currency >= n)
        ctx.addIssue({ code: 'custom', path: ['drops', i, 'currency'], message: 'no_currency' });
    });
    d.shop.forEach((s, i) =>
      s.cost.forEach((c, j) => {
        if (c.currency >= n)
          ctx.addIssue({ code: 'custom', path: ['shop', i, 'cost', j, 'currency'], message: 'no_currency' });
      }),
    );
  });
export type ExchangeDef = z.infer<typeof exchangeDef>;

const DEF_SCHEMAS = {
  goals: goalsDef,
  grid: gridDef,
  pass: passDef,
  boost: boostDef,
  exchange: exchangeDef,
  coop: coopDef,
} as const;

const common = z.object({
  shardId: z.number().int().positive().nullable(),
  kind: z.enum(ACTIVITY_KINDS),
  title: limitedText(ACTIVITY_TITLE_MAX),
  body: limitedText(ACTIVITY_BODY_MAX),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  minLevel: z.number().int().min(1).max(9999),
  def: z.unknown(),
});
type Common = Omit<z.infer<typeof common>, 'kind' | 'def'>;
export type ActivityInput = Common & ActivitySpec;

/** 请求体：公共字段 + 按 kind 校验 def；def 的错误路径前面加上 def（设计 §5.2） */
export const activityBody = common
  .superRefine((b, ctx) => {
    if (new Date(b.endsAt) <= new Date(b.startsAt))
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'before_start' });
    // 全服加成作用在区服数值上，对所有等级都生效（148-4 终审 I1）
    if (b.kind === 'boost' && b.minLevel !== 1)
      ctx.addIssue({ code: 'custom', path: ['minLevel'], message: 'boost_all_levels' });
    const r = DEF_SCHEMAS[b.kind].safeParse(b.def);
    if (!r.success) for (const i of r.error.issues) ctx.addIssue({ ...i, path: ['def', ...i.path] });
  })
  .transform((b) => ({ ...b, def: DEF_SCHEMAS[b.kind].parse(b.def) }) as ActivityInput);

export interface ActivityRewardDto {
  key: string;
  award: RewardItems;
  reached: boolean;
  /** 领取方式；没领为 null */
  claimed: 'page' | 'mail' | null;
}
export type ActivityState = 'running' | 'settling' | 'ended';
export type ActivityDto = {
  id: number;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  minLevel: number;
  state: ActivityState;
  /** 行为键 → 活动期间次数；战令另有 points */
  counters: Record<string, number>;
  /** 战令：今天各规则已加的分 */
  today: Record<string, number>;
  premium: boolean;
  rewards: ActivityRewardDto[];
  claimable: number;
  /** 兑换活动：结束后还能兑换到什么时候（ends_at + graceHours）；其他类型为 null */
  exchangeUntil: string | null;
  /** 全服合力：本区服总分、前 10 名、我的名次（148-3 设计 §8.1）；其他类型为 null */
  coop: ActivityCoopDto | null;
} & ActivitySpec;
export interface ActivitiesDto {
  items: ActivityDto[];
  level: number;
}
export interface ActivitySummaryDto {
  running: number;
  claimable: number;
}
export interface ActivityClaimDto {
  keys: string[];
  items: RewardItems[];
}
export type AdminActivityState = 'pending' | 'running' | 'settling' | 'settled';
export type AdminActivityDto = {
  id: number;
  shardId: number | null;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  minLevel: number;
  state: AdminActivityState;
  participants: number;
  createdAt: string;
  updatedAt: string;
  actor: string | null;
} & ActivitySpec;

export interface ActivityExchangeDto {
  index: number;
  times: number;
  items: RewardItems;
}

export interface ActivityCoopDto {
  pool: number;
  top: Array<{ rank: number; restId: number; name: string; points: number; mine: boolean }>;
  myRank: number | null;
}
