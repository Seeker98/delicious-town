import type { RandomEventDef, RandomQuizDef, RandomWhen, Tuning } from '@dt/config';
import { addDays, buildPool, DAY_MS, gameParts, pickWeighted, type Rng } from '@dt/shared';

export type RandomTuning = Tuning['randomEvents'];

/** 时段（设计稿 §3）：游戏日 + 序号，以及这一段在什么时候结束 */
export function slotOf(now: Date, slotHours: number): { key: string; end: Date } {
  const { day, hour, minute } = gameParts(now);
  const idx = Math.floor(hour / slotHours);
  const leftMin = ((idx + 1) * slotHours - hour) * 60 - minute;
  const end = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + leftMin * 60_000);
  return { key: `${day}#${idx}`, end };
}

/** 判断出现条件用的“现在” */
export interface WhenCtx {
  hour: number;
  /** 1 = 周一 … 7 = 周日 */
  weekday: number;
  month: number;
  /** 月-日 */
  mmdd: string;
  weatherId: number;
  level: number;
}

export function whenCtx(now: Date, weatherId: number, level: number): WhenCtx {
  const { day, hour } = gameParts(now);
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return {
    hour,
    weekday: dow === 0 ? 7 : dow,
    month: Number(day.slice(5, 7)),
    mmdd: day.slice(5),
    weatherId,
    level,
  };
}

/** [起, 止)；止 ≤ 起时跨午夜 */
function inHours([from, to]: [number, number], h: number): boolean {
  return from < to ? h >= from && h < to : h >= from || h < to;
}

/** 月-日 起止含两头；起 > 止时跨年 */
function inDates([from, to]: [string, string], d: string): boolean {
  return from <= to ? d >= from && d <= to : d >= from || d <= to;
}

export function whenMatches(w: RandomWhen | undefined, c: WhenCtx): boolean {
  if (!w) return true;
  if (w.hours && !inHours(w.hours, c.hour)) return false;
  if (w.weekdays && !w.weekdays.includes(c.weekday)) return false;
  if (w.months && !w.months.includes(c.month)) return false;
  if (w.dates && !inDates(w.dates, c.mmdd)) return false;
  if (w.weather && !w.weather.includes(c.weatherId)) return false;
  if (w.minLevel && c.level < w.minLevel) return false;
  return true;
}

/** 这家店出现过的一行（只要判断用到的几列） */
export interface PastRow {
  kind: 'notice' | 'choice' | 'quiz' | 'quizNight';
  refId: number;
  choice: string | null;
  /** 游戏日 */
  day: string;
  /** 问答夜答过的题 */
  quizIds: number[];
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const isEvent = (r: PastRow) => r.kind !== 'quiz';

/**
 * 连续剧的权重（设计稿 §3.1）：前置里最近一次满足的那行之后这一段还没出过，且已隔 minDays 天；
 * 每多等一天加 chainWeightPerDay，最多 chainWeightMax。不满足返回 0
 */
export function chainWeight(
  e: RandomEventDef,
  past: readonly PastRow[],
  today: string,
  t: RandomTuning,
): number {
  const a = e.after;
  if (!a) return e.weight;
  const heads = past.filter(
    (r) => isEvent(r) && a.events.includes(r.refId) && (a.option === undefined || r.choice === a.option),
  );
  if (heads.length === 0) return 0;
  const head = heads.reduce((x, y) => (y.day > x.day ? y : x));
  if (past.some((r) => isEvent(r) && r.refId === e.id && r.day >= head.day)) return 0;
  const waited = daysBetween(head.day, today) - a.minDays;
  if (waited < 0) return 0;
  return Math.min(t.chainWeightMax, e.weight + waited * t.chainWeightPerDay);
}

/** 能出的事件和权重：出现条件、新手不出减益、不重复期、连续剧前置 */
export function eventCandidates(
  events: Iterable<RandomEventDef>,
  past: readonly PastRow[],
  c: WhenCtx,
  today: string,
  t: RandomTuning,
  opts: { quizNight: boolean },
): Array<{ e: RandomEventDef; w: number }> {
  const since = addDays(today, -t.noRepeatDays + 1);
  const recent = new Set(past.filter((r) => isEvent(r) && r.day >= since).map((r) => r.refId));
  const out: Array<{ e: RandomEventDef; w: number }> = [];
  for (const e of events) {
    if (e.kind === 'quizNight' && !opts.quizNight) continue;
    if (recent.has(e.id) || !whenMatches(e.when, c)) continue;
    if (e.debuff && c.level < t.newbieLevel) continue;
    const w = chainWeight(e, past, today, t);
    if (w > 0) out.push({ e, w });
  }
  return out;
}

/**
 * 能出的题（设计稿 §3）：知识题答过就不再出，全答过以后从最早答的开始重出；
 * 没有对错的题 opinionNoRepeatDays 天内不再出
 */
export function quizCandidates(
  quiz: Iterable<RandomQuizDef>,
  past: readonly PastRow[],
  today: string,
  t: RandomTuning,
  only: 'any' | 'knowledge',
): RandomQuizDef[] {
  const lastSeen = new Map<number, string>();
  for (const r of past) {
    const ids = r.kind === 'quiz' ? [r.refId] : r.quizIds;
    for (const id of ids) if ((lastSeen.get(id) ?? '') < r.day) lastSeen.set(id, r.day);
  }
  const since = addDays(today, -t.opinionNoRepeatDays + 1);
  const all = [...quiz].filter((q) => only === 'any' || q.type !== 'opinion');
  const knowledge = all.filter((q) => q.type !== 'opinion');
  let fresh = knowledge.filter((q) => !lastSeen.has(q.id));
  if (fresh.length === 0 && knowledge.length > 0) {
    const oldest = knowledge.map((q) => lastSeen.get(q.id)!).reduce((a, b) => (b < a ? b : a));
    fresh = knowledge.filter((q) => lastSeen.get(q.id) === oldest);
  }
  const opinions = all.filter((q) => q.type === 'opinion' && (lastSeen.get(q.id) ?? '') < since);
  return [...fresh, ...opinions];
}

/** 不放回地抽 n 个（各自等权） */
export function pickDistinct<T>(list: readonly T[], n: number, rng: Rng): T[] {
  const rest = [...list];
  const out: T[] = [];
  while (out.length < n && rest.length > 0) out.push(rest.splice(rng.int(rest.length), 1)[0]!);
  return out;
}

/** 打乱顺序：返回显示顺序 → 原下标 */
export function shuffledOrder(n: number, rng: Rng): number[] {
  return pickDistinct(
    Array.from({ length: n }, (_, i) => i),
    n,
    rng,
  );
}

export function pickEvent(list: Array<{ e: RandomEventDef; w: number }>, rng: Rng): RandomEventDef {
  return pickWeighted(
    buildPool(list, (x) => x.w),
    rng,
  ).e;
}

/** 按权重抽一个结果的下标 */
export function pickOutcome(outcomes: ReadonlyArray<{ weight: number }>, rng: Rng): number {
  const pool = buildPool(
    outcomes.map((o, i) => ({ i, w: o.weight })),
    (x) => x.w,
  );
  return pickWeighted(pool, rng).i;
}

/** “随机食材”没写等级时：按店铺等级，每 foodLevelStep 级加 1，最高 foodLevelMax */
export function foodLevelOf(restLevel: number, t: RandomTuning): number {
  return Math.max(1, Math.min(t.foodLevelMax, Math.ceil(restLevel / t.foodLevelStep)));
}
