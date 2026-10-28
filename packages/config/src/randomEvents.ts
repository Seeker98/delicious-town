import { z } from 'zod';

/**
 * 随机事件和问答（设计稿 docs/superpowers/specs/2026-10-28-random-events-design.md）。
 * 文字是简中原文；英法西按 i18n 的 randomEvents / randomQuiz 翻译，lines 是按固定顺序摊平的各段文字（eventLines）
 */

/** 事件能用的加成键：结算、幸运、特色菜、灭蟑螂、外卖已经在读的（设计稿 §5.1） */
export const RANDOM_EFFECT_KEYS = [
  'atRate',
  'spRate',
  'coinRate',
  'expRate',
  'coinValue',
  'expValue',
  'oilRate',
  'luckValue',
  'mcGoldRate',
  'killRoachNoStrengthRate',
  'taNeedtimeRate',
  'taCoinRate',
  'taExpRate',
  'taSuccessoddsRate',
] as const;
export type RandomEffectKey = (typeof RANDOM_EFFECT_KEYS)[number];

/** 数值越大对玩家越不利的键（减益判断用）；其余越小越不利 */
const WORSE_WHEN_HIGHER: ReadonlySet<string> = new Set(['spRate', 'oilRate', 'taNeedtimeRate']);
/**
 * 一个结果里每个键的上限（绝对值）：幸运 30 点、每桌 2 点；外卖的天气加成本来就大（±60%），放到 30%；其余比率 15%
 */
function effectLimit(k: string): number {
  if (k === 'luckValue') return 30;
  if (k === 'coinValue' || k === 'expValue') return 2;
  if (k.startsWith('ta')) return 0.3;
  return 0.15;
}

const int = z.number().int();
const text = z.string().min(1);

const effects = z.record(z.enum(RANDOM_EFFECT_KEYS), z.number());
const reward = z
  .object({
    coinPerLevel: int.min(1).optional(),
    expPerLevel: int.min(1).optional(),
    /** 神秘礼券 */
    tickets: int.min(1).max(10).optional(),
    /** 随机食材 num 份；level 不写时按店铺等级（tuning.randomEvents.foodLevelStep） */
    foods: z
      .object({ num: int.min(1).max(20), level: int.min(1).max(5).optional() })
      .strict()
      .optional(),
  })
  .strict();
export type RandomReward = z.infer<typeof reward>;

const result = z
  .object({
    effects: effects.optional(),
    /** 加成持续几小时 */
    hours: z.number().min(1).max(12).optional(),
    reward: reward.optional(),
  })
  .strict();

const outcome = result.extend({ weight: int.min(1).default(1), text }).strict();
export type RandomOutcome = z.infer<typeof outcome>;

const option = z
  .object({
    key: z.enum(['a', 'b', 'c']),
    label: text,
    cost: z
      .object({ coinPerLevel: int.min(1) })
      .strict()
      .optional(),
    outcomes: z.array(outcome).min(1),
  })
  .strict();
export type RandomOption = z.infer<typeof option>;

const mmdd = z.string().regex(/^\d\d-\d\d$/);
const when = z
  .object({
    /** 游戏时间 [起, 止)；止 ≤ 起时跨午夜 */
    hours: z.tuple([int.min(0).max(23), int.min(0).max(24)]).optional(),
    /** 1 = 周一 … 7 = 周日 */
    weekdays: z.array(int.min(1).max(7)).min(1).optional(),
    months: z.array(int.min(1).max(12)).min(1).optional(),
    /** 月-日 起止（含两头）；起 > 止时跨年 */
    dates: z.tuple([mmdd, mmdd]).optional(),
    weather: z.array(int.min(1)).min(1).optional(),
    minLevel: int.min(1).optional(),
  })
  .strict();
export type RandomWhen = z.infer<typeof when>;

export const rawRandomEvent = z
  .object({
    id: int.min(1),
    kind: z.enum(['notice', 'choice', 'quizNight']),
    title: text,
    body: text,
    /** 抽中的权重；稀有事件写 1 */
    weight: int.min(1).default(10),
    when: when.optional(),
    /** 连续剧：要做过 events 里任意一个（选过 option），且至少隔 minDays 天 */
    after: z
      .object({
        events: z.array(int.min(1)).min(1),
        option: z.enum(['a', 'b', 'c']).optional(),
        minDays: int.min(0).default(1),
      })
      .strict()
      .optional(),
    /** notice：弹出即生效 */
    outcome: outcome.optional(),
    /** choice */
    options: z.array(option).min(2).max(3).optional(),
    /** quizNight：按答对 0~3 道给 */
    scores: z.array(outcome).length(4).optional(),
    /** 原型说明，只给自己看，不进游戏 */
    origin: z.string().optional(),
  })
  .strict();
export type RawRandomEvent = z.infer<typeof rawRandomEvent>;

export const rawRandomQuiz = z
  .object({
    id: int.min(1),
    type: z.enum(['game', 'fact', 'opinion']),
    q: text,
    /** dynamic 题的选项由服务端现出，这里留空 */
    choices: z.array(text).max(4),
    /** game、fact 的正确选项下标 */
    answer: int.min(0).max(3).optional(),
    explain: text.optional(),
    /** 答对的奖励；不写时用 tuning.randomEvents.correctTickets 张神秘礼券 */
    reward: reward.optional(),
    /** opinion：每个选项各自的效果或奖励，和 choices 一一对应 */
    results: z.array(result).optional(),
    /** 现实题写于哪年（设计稿 §4） */
    year: int.min(2020).optional(),
    /** AI、meme 题每年复查 */
    recheck: z.boolean().default(false),
    /** 选项现出：grade = 从普通到品级上限里抽四个，答案是最高的 */
    dynamic: z.enum(['grade']).optional(),
  })
  .strict();
export type RawRandomQuiz = z.infer<typeof rawRandomQuiz>;

export interface RandomEventDef extends Omit<RawRandomEvent, 'origin'> {
  /** 有任何一个结果带减益（构建时算出）：新手不出 */
  debuff: boolean;
}
export type RandomQuizDef = RawRandomQuiz;

/** 一组效果里有没有对玩家不利的 */
export function hasDebuff(e: Partial<Record<string, number>> | undefined): boolean {
  if (!e) return false;
  return Object.entries(e).some(([k, v]) => (WORSE_WHEN_HIGHER.has(k) ? v! > 0 : v! < 0));
}

function outcomesOf(e: RawRandomEvent): RandomOutcome[] {
  return [
    ...(e.outcome ? [e.outcome] : []),
    ...(e.options ?? []).flatMap((o) => o.outcomes),
    ...(e.scores ?? []),
  ];
}

/**
 * 事件里要翻译的各段文字按固定顺序摊平：notice 的结果；choice 每个选项的名字、各结果；quizNight 四档结果。
 * 翻译文件的 lines 按这个顺序写
 */
export function eventLines(e: Pick<RawRandomEvent, 'outcome' | 'options' | 'scores'>): string[] {
  return [
    ...(e.outcome ? [e.outcome.text] : []),
    ...(e.options ?? []).flatMap((o) => [o.label, ...o.outcomes.map((x) => x.text)]),
    ...(e.scores ?? []).map((x) => x.text),
  ];
}

/** 按摊平的译文还原各段文字；译文条数不对时用原文 */
export function eventTexts(
  e: RandomEventDef,
  t?: { name?: string; desc?: string; lines?: string[] },
): {
  title: string;
  body: string;
  outcome: string | null;
  options: Array<{ key: string; label: string; outcomes: string[] }>;
  scores: string[];
} {
  const src = eventLines(e);
  const lines = t?.lines && t.lines.length === src.length ? t.lines : src;
  let i = 0;
  const next = () => lines[i++]!;
  const outcome = e.outcome ? next() : null;
  const options = (e.options ?? []).map((o) => ({
    key: o.key,
    label: next(),
    outcomes: o.outcomes.map(() => next()),
  }));
  const scores = (e.scores ?? []).map(() => next());
  return { title: t?.name ?? e.title, body: t?.desc ?? e.body, outcome, options, scores };
}

function checkEffects(where: string, r: z.infer<typeof result>, errors: string[]): void {
  const keys = Object.entries(r.effects ?? {});
  if (keys.length > 0 && r.hours === undefined) errors.push(`${where}: effects need hours`);
  if (keys.length === 0 && r.hours !== undefined) errors.push(`${where}: hours without effects`);
  for (const [k, v] of keys) {
    if (v === 0) errors.push(`${where}: ${k} is 0`);
    if (Math.abs(v!) > effectLimit(k)) errors.push(`${where}: ${k} ${v} out of range`);
    if (k === 'atRate' && v! < -0.05) errors.push(`${where}: atRate debuff below -0.05`);
  }
}

/** 构建时的校验（设计稿 §14）：结构、引用、数值范围；返回带 debuff 的事件 */
export function buildRandomContent(
  events: RawRandomEvent[],
  quiz: RawRandomQuiz[],
  ctx: { weatherIds: ReadonlySet<number> },
  errors: string[],
): { events: RandomEventDef[]; quiz: RandomQuizDef[] } {
  const ids = new Set<number>();
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const e of events) {
    const at = `random_events ${e.id}`;
    if (ids.has(e.id)) errors.push(`${at}: duplicate id`);
    ids.add(e.id);
    if (e.kind === 'notice' && (!e.outcome || e.options || e.scores))
      errors.push(`${at}: notice needs outcome only`);
    if (e.kind === 'choice' && (!e.options || e.outcome || e.scores))
      errors.push(`${at}: choice needs options only`);
    if (e.kind === 'quizNight' && (!e.scores || e.outcome || e.options))
      errors.push(`${at}: quizNight needs scores only`);
    if (e.options) {
      const keys = e.options.map((o) => o.key);
      if (new Set(keys).size !== keys.length || keys.join('') !== 'abc'.slice(0, keys.length))
        errors.push(`${at}: option keys must be a, b, c in order`);
    }
    for (const w of e.when?.weather ?? [])
      if (!ctx.weatherIds.has(w)) errors.push(`${at}: unknown weather ${w}`);
    const d = e.when?.dates;
    if (d && d.some((x) => !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x)))
      errors.push(`${at}: bad date`);
    if (e.when?.hours && e.when.hours[0] === e.when.hours[1]) errors.push(`${at}: empty hours`);
    for (const pid of e.after?.events ?? []) {
      const p = byId.get(pid);
      if (!p) errors.push(`${at}: after unknown event ${pid}`);
      else if (e.after!.option && !p.options?.some((o) => o.key === e.after!.option))
        errors.push(`${at}: after unknown option ${e.after!.option}`);
    }
    outcomesOf(e).forEach((o, i) => checkEffects(`${at} outcome ${i}`, o, errors));
  }
  const qids = new Set<number>();
  for (const q of quiz) {
    const at = `random_quiz ${q.id}`;
    if (qids.has(q.id)) errors.push(`${at}: duplicate id`);
    qids.add(q.id);
    if (q.dynamic) {
      if (q.choices.length !== 0 || q.answer !== undefined || q.type !== 'game')
        errors.push(`${at}: dynamic quiz is a game quiz without fixed choices`);
      continue;
    }
    if (q.choices.length < 2) errors.push(`${at}: needs at least 2 choices`);
    if (q.type === 'opinion') {
      if (q.answer !== undefined || q.reward) errors.push(`${at}: opinion quiz has no answer`);
      if (!q.results || q.results.length !== q.choices.length)
        errors.push(`${at}: results must match choices`);
      q.results?.forEach((r, i) => checkEffects(`${at} result ${i}`, r, errors));
    } else {
      if (q.answer === undefined || q.answer >= q.choices.length) errors.push(`${at}: answer out of range`);
      if (q.results) errors.push(`${at}: only opinion quiz has results`);
    }
    if (q.type === 'fact' && q.year === undefined) errors.push(`${at}: fact quiz needs year`);
  }
  return {
    events: events.map(({ origin: _origin, ...e }) => ({
      ...e,
      debuff: outcomesOf(e).some((o) => hasDebuff(o.effects)),
    })),
    quiz,
  };
}
