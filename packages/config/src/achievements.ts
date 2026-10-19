import { z } from 'zod';

/**
 * 成就（设计稿 docs/superpowers/specs/2026-10-19-achievements-design.md）：一条成就线有几档，每档一个成就。
 * 成就编号 = 线的 key + "." + 档序号（1 起），菜系线按街道展开成 cuisine.<街道>。只给成就点和装饰（奖杯、称号）。
 */
export const ACH_CATS = [
  'rest',
  'daily',
  'cookbook',
  'mc',
  'friend',
  'bar',
  'tower',
  'temple',
  'finance',
  'town',
  'hidden',
] as const;
export type AchCat = (typeof ACH_CATS)[number];
export const TROPHY_TONES = ['bronze', 'silver', 'gold', 'rainbow'] as const;
export type TrophyTone = (typeof TROPHY_TONES)[number];

/** 服务端 achieve 模块能算的状态名；grade、cuisine、towerWeeks、fund 后面带参数（冒号分隔） */
export const ACH_STATE_METRICS = [
  'level',
  'star',
  'renown',
  'signinBest',
  'weeklyFull',
  'chapters',
  'streets',
  'wishWins',
  'mayorStreak',
  'cookLearned',
  'grade',
  'cuisine',
  'mcLearned',
  'mcLevel',
  'friends',
  'invite30',
  'towerFloor',
  'towerWeeks',
  'suits',
  'predictEvents',
  'fund',
  'talkAll',
  'barPlayed',
  'barWon',
  'friendsAll',
  'mayorMiss',
  'wishLose',
] as const;
export type AchStateMetric = (typeof ACH_STATE_METRICS)[number];

const metricRe = /^(counter:[a-zA-Z0-9_.:-]+|state:[a-zA-Z0-9]+(:[A-Za-z0-9]+)?)$/;

export const rawAchTier = z.object({
  n: z.number().int().min(1),
  pts: z.number().int().min(1).max(100),
  metric: z.string().regex(metricRe).optional(),
  trophy: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  icon: z.string().optional(),
});
export const rawAchLine = z.object({
  key: z.string().regex(/^[a-z0-9]+$/),
  cat: z.enum(ACH_CATS),
  name: z.string().min(1),
  desc: z.string().min(1),
  metric: z.string().regex(metricRe).optional(),
  labels: z.array(z.string().min(1)).optional(),
  perStreet: z.boolean().optional(),
  /** 隐藏成就：达成前网页只显示 ???（分类 hidden，点数固定） */
  hidden: z.boolean().optional(),
  tiers: z.array(rawAchTier).min(1),
});
export const rawTrophy = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  tone: z.enum(TROPHY_TONES),
});

export interface AchTier {
  /** 成就编号：线 key + "." + 档序号 */
  id: string;
  /** 档序号，1 起 */
  tier: number;
  n: number;
  pts: number;
  metric: string;
  trophy: string | null;
  icon: string | null;
}
export interface AchLine {
  key: string;
  cat: AchCat;
  name: string;
  desc: string;
  /** 菜系线展开后的街道；其余是 null */
  streetId: number | null;
  /** 各档显示名（星级、熟练等级、基金档）；null 显示门槛数字 */
  labels: string[] | null;
  /** 隐藏成就：达成前只显示 ??? */
  hidden: boolean;
  tiers: AchTier[];
}
export interface Trophy {
  key: string;
  name: string;
  tone: TrophyTone;
  /** 菜系奖杯的街道（名字用街道的菜系名 + “宗师”）；其余 null */
  streetId: number | null;
}

/** 展开菜系线、校验引用；errors 里写出错的地方 */
export function buildAchievements(
  rawLines: z.infer<typeof rawAchLine>[],
  rawTrophies: z.infer<typeof rawTrophy>[],
  ctx: { streetIds: number[]; iconKeys: ReadonlySet<string> },
  errors: string[],
): { lines: AchLine[]; trophies: Trophy[] } {
  const trophyTpl = new Map(rawTrophies.map((t) => [t.key, t]));
  if (trophyTpl.size !== rawTrophies.length) errors.push('trophies: duplicate key');
  const trophies: Trophy[] = [];
  const lines: AchLine[] = [];
  const usedTrophies = new Set<string>();
  const seenKeys = new Set<string>();
  for (const raw of rawLines) {
    if (seenKeys.has(raw.key)) errors.push(`achievements: duplicate key ${raw.key}`);
    seenKeys.add(raw.key);
    if ((raw.cat === 'hidden') !== (raw.hidden ?? false))
      errors.push(`achievements ${raw.key}: hidden lines go in cat hidden (and only there)`);
    if (raw.labels && raw.labels.length !== raw.tiers.length)
      errors.push(`achievements ${raw.key}: labels count ${raw.labels.length} != tiers ${raw.tiers.length}`);
    for (const [i, t] of raw.tiers.entries()) {
      const metric = t.metric ?? raw.metric;
      if (!metric) errors.push(`achievements ${raw.key} tier ${i + 1}: no metric`);
      else if (metric.startsWith('state:')) {
        const name = metric.slice(6).split(':')[0]!;
        if (!(ACH_STATE_METRICS as readonly string[]).includes(name))
          errors.push(`achievements ${raw.key}: unknown state metric ${metric}`);
      }
      if (t.icon && !ctx.iconKeys.has(t.icon)) errors.push(`achievements ${raw.key}: unknown icon ${t.icon}`);
      if (t.trophy) {
        if (!trophyTpl.has(t.trophy)) errors.push(`achievements ${raw.key}: unknown trophy ${t.trophy}`);
        if (usedTrophies.has(t.trophy)) errors.push(`achievements ${raw.key}: trophy ${t.trophy} used twice`);
        usedTrophies.add(t.trophy);
      }
      // 同一个口径的档门槛要递增（不同口径的档，比如菜系三档，各算各的）
      const prev = raw.tiers[i - 1];
      if (prev && (prev.metric ?? raw.metric) === metric && prev.n >= t.n)
        errors.push(`achievements ${raw.key}: tier ${i + 1} threshold not increasing`);
    }
    const streets = raw.perStreet ? ctx.streetIds : [null];
    for (const streetId of streets) {
      const key = streetId === null ? raw.key : `${raw.key}.${streetId}`;
      const trophyKey = (k: string | undefined) =>
        k === undefined ? null : streetId === null ? k : `${k}.${streetId}`;
      lines.push({
        key,
        cat: raw.cat,
        name: raw.name,
        desc: raw.desc,
        streetId,
        labels: raw.labels ?? null,
        hidden: raw.hidden ?? false,
        tiers: raw.tiers.map((t, i) => ({
          id: `${key}.${i + 1}`,
          tier: i + 1,
          n: t.n,
          pts: t.pts,
          metric: (t.metric ?? raw.metric)!,
          trophy: trophyKey(t.trophy),
          icon: t.icon ?? null,
        })),
      });
      for (const t of raw.tiers) {
        if (!t.trophy) continue;
        const tpl = trophyTpl.get(t.trophy);
        if (tpl) trophies.push({ key: trophyKey(t.trophy)!, name: tpl.name, tone: tpl.tone, streetId });
      }
    }
  }
  for (const k of trophyTpl.keys())
    if (!usedTrophies.has(k)) errors.push(`trophies: ${k} not used by any achievement`);
  return { lines, trophies };
}

/** 成就编号 → 那一档和它的线 */
export interface AchIndex {
  byId: ReadonlyMap<string, { line: AchLine; tier: AchTier }>;
  /** event_counter 键 → 用这个计数的档（达成判断在计数加完后查这里） */
  byCounter: ReadonlyMap<string, Array<{ line: AchLine; tier: AchTier }>>;
  /** 状态类的档（每天扫、打开成就页时算） */
  stateTiers: ReadonlyArray<{ line: AchLine; tier: AchTier }>;
  trophies: ReadonlyMap<string, Trophy>;
}

export function buildAchIndex(lines: AchLine[], trophies: Trophy[]): AchIndex {
  const byId = new Map<string, { line: AchLine; tier: AchTier }>();
  const byCounter = new Map<string, Array<{ line: AchLine; tier: AchTier }>>();
  const stateTiers: Array<{ line: AchLine; tier: AchTier }> = [];
  for (const line of lines)
    for (const tier of line.tiers) {
      byId.set(tier.id, { line, tier });
      if (tier.metric.startsWith('counter:')) {
        const k = tier.metric.slice(8);
        const list = byCounter.get(k) ?? [];
        list.push({ line, tier });
        byCounter.set(k, list);
      } else stateTiers.push({ line, tier });
    }
  return { byId, byCounter, stateTiers, trophies: new Map(trophies.map((t) => [t.key, t])) };
}
